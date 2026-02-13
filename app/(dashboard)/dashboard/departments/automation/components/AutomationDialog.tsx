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
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
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
  FileText, Database, Paperclip, Settings2, GripVertical, // GripVertical is used for the drag handle
  Download, FileSpreadsheet,
  ChevronRight, FunctionSquare, Calculator, Table as TableIcon,
  Info, AlertCircle, Key, Globe, Shield, LayoutGrid, List,
  MousePointerClick,
  Type,
  Layers,
  Pencil,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Files,
  ArrowRight,
  Eye,
  EyeOff,
  HelpCircle,
  Zap
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
    displayName: string;
    variableName: string;
    type: 'text' | 'number' | 'boolean' | 'date' | 'select' | 'document';
    linkedMasterFieldId?: number;
    linkedMasterFields?: number[];
    linkedKycDocuments?: string[];
    sourceLogic?: 'all' | 'priority';
    linkedJobQuestionId?: string;
    linkedJobQuestionIds?: string[];
    documentLogic?: 'merge' | 'fallback';
    dateFormat?: 'iso' | 'object_split' | 'dd_mm_yyyy';
    extractionMode?: 'latest' | 'all';
    entityTypes?: string[];
    dependantRelationships?: string[];
    directorType?: 'all' | 'primary';
  }>;
  linkedMasterFields: number[];
  linkedJobQuestionId?: string;
  linkedJobQuestionIds?: string[];
  sourceLogic?: 'all' | 'priority';
  kycDocumentId?: string; // Legacy support
  linkedKycDocuments?: string[]; // Array of IDs
  documentLogic?: 'merge' | 'fallback';
  documentCount?: number; // Number of documents required
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

// --- Helper Functions for Field Name Formatting ---
function formatDisplayName(input: string): string {
  if (!input) return '';

  // Convert camelCase or PascalCase to space-separated words
  // e.g., "PinNo" -> "Pin No", "firstName" -> "First Name"
  let formatted = input
    .replace(/([a-z])([A-Z])/g, '$1 $2')  // Add space between lowercase and uppercase
    .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2')  // Handle acronyms like "IDNumber" -> "ID Number"
    .replace(/[_-]/g, ' ')  // Replace underscores and hyphens with spaces
    .trim();

  // Capitalize first letter of each word
  formatted = formatted
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');

  return formatted;
}

function formatVariableName(input: string): string {
  if (!input) return '';

  // Convert to camelCase
  return input
    .replace(/[_-]/g, ' ')  // Replace underscores and hyphens with spaces
    .replace(/\s+(.)/g, (_, chr) => chr.toUpperCase())  // Capitalize after spaces
    .replace(/\s/g, '')  // Remove all spaces
    .replace(/^(.)/, (_, chr) => chr.toLowerCase());  // Ensure first letter is lowercase
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
        <Button variant="outline" size="sm" className="w-full justify-between px-3 text-sm bg-white border-slate-200 text-slate-700">
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
          <CommandInput placeholder="Search entities..." className="h-9 text-sm" />
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

function MultiJobQuestionPicker({
  availableQuestions,
  linkedQuestionIds,
  onSelect
}: {
  availableQuestions: any[];
  linkedQuestionIds: string[];
  onSelect: (questionId: string) => void;
}) {
  const [open, setOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState("")

  const filteredQuestions = availableQuestions.filter(q =>
    q.label.toLowerCase().includes(searchTerm.toLowerCase())
  )

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" type="button" className="h-6 w-6 p-0 rounded-md hover:bg-purple-50 text-purple-500 transition-colors">
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-0" align="start">
        <div className="p-3 border-b">
          <Input
            placeholder="Search job questions..."
            className="h-9 text-sm"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <ScrollArea className="h-[200px]">
          <div className="p-1">
            {filteredQuestions.length === 0 ? (
              <div className="py-6 text-center text-sm text-slate-500">
                No questions found.
              </div>
            ) : (
              filteredQuestions.map((q) => {
                const isLinked = linkedQuestionIds.includes(q.id);
                return (
                  <div
                    key={q.id}
                    className={cn(
                      "flex items-center gap-2 p-2 rounded-sm cursor-pointer text-sm",
                      isLinked ? "bg-slate-100 opacity-50 cursor-not-allowed" : "hover:bg-slate-100"
                    )}
                    onClick={() => {
                      if (!isLinked) {
                        onSelect(q.id);
                        setOpen(false);
                      }
                    }}
                  >
                    <HelpCircle className="h-3 w-3 mr-2 text-purple-400" />
                    <span className={cn("flex-1", isLinked && "line-through")}>
                      {q.label}
                    </span>
                    {isLinked && (
                      <Check className="h-3 w-3 text-green-600" />
                    )}
                  </div>
                );
              })
            )}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  )
}

function ArrayConfigurator({ group, masterFields, kycDocuments, jobQuestions, onUpdate }: {
  group: WebDataGroup;
  masterFields: JobField[];
  kycDocuments: KYCDocument[];
  jobQuestions: any[];
  onUpdate: (items: any[]) => void;
}) {
  const items = group.arrayItems || [];

  const handleItemChange = (idx: number, field: string, value: any) => {
    const newItems = [...items];
    newItems[idx] = { ...newItems[idx], [field]: value };
    onUpdate(newItems);
  };

  // Helper handlers for the SourcePriorityManager within an array item
  const moveArrayItemSource = (itemIdx: number, listKey: 'linkedMasterFields' | 'linkedJobQuestionIds', sourceIdx: number, direction: 'up' | 'down') => {
    const newItems = [...items];
    const newList = [...(newItems[itemIdx][listKey] || [])] as any[];
    const targetIndex = direction === 'up' ? sourceIdx - 1 : sourceIdx + 1;
    if (targetIndex < 0 || targetIndex >= newList.length) return;
    [newList[sourceIdx], newList[targetIndex]] = [newList[targetIndex], newList[sourceIdx]];
    newItems[itemIdx] = { ...newItems[itemIdx], [listKey]: newList };
    onUpdate(newItems);
  };

  const unlinkArrayItemMaster = (itemIdx: number, fieldId: number) => {
    const newItems = [...items];
    newItems[itemIdx] = {
      ...newItems[itemIdx],
      linkedMasterFields: (newItems[itemIdx].linkedMasterFields || []).filter(id => id !== fieldId)
    };
    onUpdate(newItems);
  };

  const unlinkArrayItemQuestion = (itemIdx: number, qId: string) => {
    const newItems = [...items];
    newItems[itemIdx] = {
      ...newItems[itemIdx],
      linkedJobQuestionIds: (newItems[itemIdx].linkedJobQuestionIds || []).filter(id => id !== qId)
    };
    onUpdate(newItems);
  };

  const addItem = () => {
    const newItem = {
      name: '',
      displayName: '',
      variableName: '',
      type: 'text',
      entityTypes: group.entityTypes || ['principal'],
      dependantRelationships: [],
      directorType: undefined,
      linkedMasterFields: [],
      linkedKycDocuments: [],
      linkedJobQuestionIds: [],
      sourceLogic: 'priority'
    };
    onUpdate([...items, newItem]);
  };

  const [itemToDeleteIndex, setItemToDeleteIndex] = useState<number | null>(null);
  const [deleteItemDialogOpen, setDeleteItemDialogOpen] = useState(false);

  const requestDeleteItem = (idx: number) => {
    setItemToDeleteIndex(idx);
    setDeleteItemDialogOpen(true);
  };

  const confirmRemoveItem = () => {
    if (itemToDeleteIndex !== null) {
      const newItems = items.filter((_, i) => i !== itemToDeleteIndex);
      onUpdate(newItems);
      setDeleteItemDialogOpen(false);
      setItemToDeleteIndex(null);
    }
  };

  const linkMasterField = (idx: number, field: JobField) => {
    const newItems = [...items];
    const current = newItems[idx].linkedMasterFields || [];
    if (!current.includes(field.id)) {
      newItems[idx] = { ...newItems[idx], linkedMasterFields: [...current, field.id] };
      onUpdate(newItems);
    }
  };

  const linkJobQuestion = (idx: number, questionId: string) => {
    const newItems = [...items];
    const current = newItems[idx].linkedJobQuestionIds || [];
    if (!current.includes(questionId)) {
      newItems[idx] = { ...newItems[idx], linkedJobQuestionIds: [...current, questionId] };
      onUpdate(newItems);
    }
  };

  // ... (linkDocument/unlinkDocument functions remain unchanged)
  const linkDocument = (idx: number, docId: string) => {
    const newItems = [...items];
    const currentLinkedDocs = newItems[idx].linkedKycDocuments || [];
    if (!currentLinkedDocs.includes(docId)) {
      newItems[idx] = { ...newItems[idx], linkedKycDocuments: [...currentLinkedDocs, docId] };
      onUpdate(newItems);
    }
  };

  const unlinkDocument = (idx: number, docId: string) => {
    const newItems = [...items];
    const currentLinkedDocs = newItems[idx].linkedKycDocuments || [];
    newItems[idx] = { ...newItems[idx], linkedKycDocuments: currentLinkedDocs.filter(id => id !== docId) };
    onUpdate(newItems);
  };

  const [open, setOpen] = useState(false);

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm" className={cn(
            "w-full justify-between px-3 text-sm bg-white border-slate-200 hover:bg-slate-50 transition-colors",
            items.length > 0 ? "text-blue-700 border-blue-200 bg-blue-50 hover:bg-blue-100" : "text-slate-500"
          )}>
            <span className="flex items-center gap-2">
              <TableIcon className="h-3.5 w-3.5" />
              {items.length > 0 ? `${items.length} column${items.length !== 1 ? 's' : ''} defined` : "Configure Array Columns"}
            </span>
            <ChevronRight className="h-3 w-3 opacity-50" />
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-7xl max-h-[90vh] p-0 flex flex-col border-none shadow-2xl">
          <DialogHeader className="px-6 py-4 border-b bg-gradient-to-r from-blue-50 to-indigo-50 shrink-0">
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle className="flex items-center gap-2 text-slate-900 text-xl font-bold">
                  <div className="h-8 w-8 rounded-lg bg-blue-600 flex items-center justify-center">
                    <TableIcon className="h-4 w-4 text-white" />
                  </div>
                  Array Column Mapping
                </DialogTitle>
                <DialogDescription className="mt-1 text-slate-600">
                  Define the schema for rows within the <strong className="text-blue-700">{group.variableName}</strong> array.
                </DialogDescription>
              </div>
              <Button size="sm" onClick={addItem} className="h-9 px-4 text-sm bg-blue-600 hover:bg-blue-700 text-white font-semibold">
                <Plus className="h-4 w-4 mr-1.5" /> Add Column
              </Button>
            </div>
          </DialogHeader>

          <ScrollArea className="flex-1 overflow-auto">
            <div className="w-full p-4 bg-slate-50/50">
              <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
                <Table>
                  <TableHeader className="bg-slate-100 border-b-2 border-slate-200 sticky top-0 z-10">
                    <TableRow>
                      <TableHead className="w-[12%] text-[10px] font-black text-slate-700 uppercase">Display Name</TableHead>
                      <TableHead className="w-[12%] text-[10px] font-black text-slate-700 uppercase">Web Key</TableHead>
                      <TableHead className="w-[10%] text-[10px] font-black text-slate-700 uppercase">Type</TableHead>
                      <TableHead className="w-[12%] text-[10px] font-black text-slate-700 uppercase">Scope</TableHead>
                      <TableHead className="w-[34%] text-[10px] font-black text-slate-700 uppercase">Source Mapping</TableHead>
                      <TableHead className="w-[10%] text-[10px] font-black text-slate-700 uppercase">Mode</TableHead>
                      <TableHead className="w-[10%] text-center text-[10px] font-black text-slate-700 uppercase">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item, i) => {
                      const totalSources = (item.linkedMasterFields?.length || 0) + (item.linkedJobQuestionIds?.length || 0);
                      
                      return (
                        <TableRow key={i} className="hover:bg-slate-50 border-b border-slate-100">
                          <TableCell className="p-3">
                            <Input value={item.displayName || ''} onChange={e => handleItemChange(i, 'displayName', e.target.value)} className="h-9 text-sm" placeholder="Label" />
                          </TableCell>
                          <TableCell className="p-3">
                            <Input value={item.variableName} onChange={e => handleItemChange(i, 'variableName', e.target.value)} className="h-9 text-sm font-mono" placeholder="key" />
                          </TableCell>
                          <TableCell className="p-3">
                            <div className="flex flex-col gap-1.5">
                              <Select value={item.type} onValueChange={(val) => handleItemChange(i, 'type', val)}>
                                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="text">Text</SelectItem>
                                  <SelectItem value="number">Number</SelectItem>
                                  <SelectItem value="date">Date</SelectItem>
                                  <SelectItem value="document">Document</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </TableCell>
                          <TableCell className="p-3">
                            <EntityConfigurator
                              group={{ ...item, id: `item-${i}`, fieldType: item.type } as any}
                              onUpdate={(updates) => handleItemChange(i, 'entityTypes', updates.entityTypes)}
                            />
                          </TableCell>
                          <TableCell className="p-3">
                            {item.type === 'document' ? (
                               <div className="space-y-2">
                                  <div className="flex flex-wrap gap-1.5 mb-1">
                                    {item.linkedKycDocuments?.map(docId => (
                                      <Badge key={docId} variant="secondary" className="bg-amber-50 text-amber-700 h-6 border-amber-200">
                                        {kycDocuments.find(d => d.id === docId)?.display_name || docId}
                                        <X className="h-3 w-3 ml-1.5 cursor-pointer" onClick={() => unlinkDocument(i, docId)} />
                                      </Badge>
                                    ))}
                                  </div>
                                  <MultiDocumentPicker
                                    availableDocuments={kycDocuments}
                                    linkedDocumentIds={item.linkedKycDocuments || []}
                                    onSelect={(doc) => linkDocument(i, doc.id)}
                                  />
                               </div>
                            ) : (
                              <div className="space-y-2">
                                <div className="flex items-center justify-between p-2 bg-slate-100/50 rounded-lg border border-slate-200 min-h-[44px]">
                                  <div className="flex flex-wrap gap-1.5">
                                    {item.linkedMasterFields?.length > 0 && (
                                      <Badge className="bg-blue-50 text-blue-700 h-6 text-[10px] border-blue-200 font-bold">
                                        {item.linkedMasterFields.length} DB
                                      </Badge>
                                    )}
                                    {item.linkedJobQuestionIds?.length > 0 && (
                                      <Badge className="bg-purple-50 text-purple-700 h-6 text-[10px] border-purple-200 font-bold">
                                        {item.linkedJobQuestionIds.length} Job
                                      </Badge>
                                    )}
                                    {totalSources === 0 && <span className="text-[10px] text-slate-400 italic">No sources</span>}
                                  </div>

                                  {totalSources > 1 && (
                                    <Popover>
                                      <PopoverTrigger asChild>
                                        <Button variant="outline" size="sm" className="h-7 px-2 text-[10px] border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100">
                                          <ArrowUpDown className="h-3 w-3 mr-1" /> Logic: {item.sourceLogic === 'all' ? 'All' : 'Priority'}
                                        </Button>
                                      </PopoverTrigger>
                                      <PopoverContent className="w-[350px] p-4 shadow-2xl border-slate-200" align="end">
                                        <div className="space-y-4">
                                          <div className="flex items-center justify-between border-b pb-2">
                                            <Label className="text-xs font-bold uppercase text-slate-500 tracking-wider">Multi-Source Logic</Label>
                                            <Select 
                                              value={item.sourceLogic || 'priority'} 
                                              onValueChange={(v) => handleItemChange(i, 'sourceLogic', v)}
                                            >
                                              <SelectTrigger className="h-7 w-[140px] text-[10px] bg-white">
                                                <SelectValue />
                                              </SelectTrigger>
                                              <SelectContent>
                                                <SelectItem value="priority">Check Priority</SelectItem>
                                                <SelectItem value="all">Return All (Array)</SelectItem>
                                              </SelectContent>
                                            </Select>
                                          </div>
                                          
                                          <SourcePriorityManager
                                            linkedMasterFields={item.linkedMasterFields || []}
                                            linkedJobQuestionIds={item.linkedJobQuestionIds || []}
                                            sourceLogic={item.sourceLogic || 'priority'}
                                            masterFields={masterFields}
                                            jobQuestions={jobQuestions}
                                            onUpdate={(key, value) => handleItemChange(i, key, value)}
                                            onMoveItem={(key, sIdx, dir) => moveArrayItemSource(i, key, sIdx, dir)}
                                            onUnlinkMaster={(id) => unlinkArrayItemMaster(i, id)}
                                            onUnlinkQuestion={(id) => unlinkArrayItemQuestion(i, id)}
                                          />
                                        </div>
                                      </PopoverContent>
                                    </Popover>
                                  )}
                                </div>
                                <div className="flex gap-2">
                                  <MultiMasterFieldPicker
                                    availableFields={masterFields}
                                    linkedFieldIds={item.linkedMasterFields || []}
                                    onSelect={(f) => linkMasterField(i, f)}
                                  />
                                  <MultiJobQuestionPicker
                                    availableQuestions={jobQuestions}
                                    linkedQuestionIds={item.linkedJobQuestionIds || []}
                                    onSelect={(qid) => linkJobQuestion(i, qid)}
                                  />
                                </div>
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="p-3">
                            <Select value={item.extractionMode || 'latest'} onValueChange={(val) => handleItemChange(i, 'extractionMode', val)}>
                              <SelectTrigger className="h-8 text-[10px] bg-white"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="latest">Latest</SelectItem>
                                <SelectItem value="all">All Entries</SelectItem>
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell className="p-3 text-center">
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-red-600 hover:bg-red-50" onClick={() => requestDeleteItem(i)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          </ScrollArea>

          <div className="px-6 py-4 bg-white border-t flex justify-end shrink-0">
            <Button onClick={() => setOpen(false)} className="px-8 bg-blue-600 hover:bg-blue-700 h-10 text-white font-semibold uppercase text-xs tracking-wide">
              Close Column Editor
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      
      {/* Delete Confirmation Alert Stays same as provided */}
      <AlertDialog open={deleteItemDialogOpen} onOpenChange={setDeleteItemDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Array Column</AlertDialogTitle>
            <AlertDialogDescription>Are you sure you want to remove this column from the array definition? This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmRemoveItem} className="bg-red-600 hover:bg-red-700">Delete Column</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function SourcePriorityManager({
  linkedMasterFields = [],
  linkedJobQuestionIds = [],
  sourceLogic = 'priority',
  masterFields,
  jobQuestions,
  onUpdate,
  onMoveItem,
  onUnlinkMaster,
  onUnlinkQuestion
}: {
  linkedMasterFields: number[];
  linkedJobQuestionIds: string[];
  sourceLogic: 'all' | 'priority';
  masterFields: JobField[];
  jobQuestions: any[];
  onUpdate: (key: string, value: any) => void;
  onMoveItem: (listKey: 'linkedMasterFields' | 'linkedJobQuestionIds', index: number, direction: 'up' | 'down') => void;
  onUnlinkMaster: (id: number) => void;
  onUnlinkQuestion: (id: string) => void;
}) {
  const hasSources = linkedMasterFields.length > 0 || linkedJobQuestionIds.length > 0;

  if (!hasSources) {
    return (
      <div className="flex flex-col items-center justify-center py-10 border-2 border-dashed rounded-lg bg-slate-50 text-slate-400">
        <Database className="h-10 w-10 mb-3 opacity-20" />
        <p className="text-sm font-semibold">No sources linked yet</p>
        <p className="text-xs mt-1 text-center max-w-[200px]">Add a database field or job question below to begin mapping data</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Database Fields Section */}
      {linkedMasterFields.length > 0 && (
        <div className="space-y-2">
          <Label className="text-xs font-black text-blue-700 uppercase tracking-wide flex items-center gap-1.5">
            <Database className="h-3.5 w-3.5" /> Database Fields
            {sourceLogic === 'priority' && (
              <span className="text-[10px] font-normal text-slate-400 lowercase ml-auto">(Priority Order)</span>
            )}
          </Label>
          <div className="flex flex-col gap-2">
            {linkedMasterFields.map((id, idx) => {
              const field = masterFields.find(f => f.id === id);
              return (
                <div 
                  key={`db-${id}`} 
                  className="flex items-center gap-2 bg-white p-3 rounded-lg border border-slate-200 shadow-sm hover:shadow-md transition-shadow group"
                >
                  {sourceLogic === 'priority' && (
                    <div className="flex flex-col gap-0.5 border-r pr-2 mr-1">
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-5 w-5 hover:text-blue-600 hover:bg-blue-50" 
                        onClick={() => onMoveItem('linkedMasterFields', idx, 'up')} 
                        disabled={idx === 0}
                      >
                        <ArrowUp className="h-3.5 w-3.5" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-5 w-5 hover:text-blue-600 hover:bg-blue-50" 
                        onClick={() => onMoveItem('linkedMasterFields', idx, 'down')} 
                        disabled={idx === linkedMasterFields.length - 1}
                      >
                        <ArrowDown className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-slate-800 truncate">{field?.label || `Field #${id}`}</div>
                    <div className="text-[10px] text-slate-400 font-mono">ID: {id}</div>
                  </div>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-7 w-7 text-slate-300 hover:text-red-600 hover:bg-red-50" 
                    onClick={() => onUnlinkMaster(id)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Job Questions Section */}
      {linkedJobQuestionIds.length > 0 && (
        <div className="space-y-2">
          <Label className="text-xs font-black text-purple-700 uppercase tracking-wide flex items-center gap-1.5">
            <HelpCircle className="h-3.5 w-3.5" /> Job Questions
            {sourceLogic === 'priority' && linkedMasterFields.length > 0 && (
              <span className="text-[10px] font-normal text-slate-400 lowercase ml-auto">(Fallback)</span>
            )}
          </Label>
          <div className="flex flex-col gap-2">
            {linkedJobQuestionIds.map((id, idx) => {
              const q = jobQuestions.find(q => q.id === id);
              return (
                <div 
                  key={`job-${id}`} 
                  className="flex items-center gap-2 bg-white p-3 rounded-lg border border-slate-200 shadow-sm hover:shadow-md transition-shadow group"
                >
                  {sourceLogic === 'priority' && (
                    <div className="flex flex-col gap-0.5 border-r pr-2 mr-1">
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-5 w-5 hover:text-purple-600 hover:bg-purple-50" 
                        onClick={() => onMoveItem('linkedJobQuestionIds', idx, 'up')} 
                        disabled={idx === 0}
                      >
                        <ArrowUp className="h-3.5 w-3.5" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-5 w-5 hover:text-purple-600 hover:bg-purple-50" 
                        onClick={() => onMoveItem('linkedJobQuestionIds', idx, 'down')} 
                        disabled={idx === linkedJobQuestionIds.length - 1}
                      >
                        <ArrowDown className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-slate-800 truncate">{q?.label || `Question ${id}`}</div>
                    <div className="text-[10px] text-slate-400 font-mono">{id}</div>
                  </div>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-7 w-7 text-slate-300 hover:text-red-600 hover:bg-red-50" 
                    onClick={() => onUnlinkQuestion(id)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function JobQuestionPicker({
  availableQuestions,
  onSelect
}: {
  availableQuestions: any[];
  onSelect: (question: any) => void
}) {
  const [open, setOpen] = useState(false);

  // Log when questions are received
  useEffect(() => {
    console.log('JobQuestionPicker - Available questions:', availableQuestions);
  }, [availableQuestions]);

  const handleQuestionSelect = (question: any) => {
    console.log('Job question selected:', question);
    onSelect(question);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" type="button" className="h-8 border-dashed border-2 text-slate-500 hover:text-purple-600 hover:border-purple-300 transition-all">
          <Plus className="h-3.5 w-3.5 mr-2" /> Link Job Question
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[320px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search job questions..." className="h-9 text-sm" />
          <CommandList>
            <CommandEmpty>No questions found.</CommandEmpty>
            <CommandGroup heading="Available Questions">
              <ScrollArea className="h-[200px]">
                {availableQuestions.map((q, idx) => (
                  <CommandItem
                    key={`${q.label}-${idx}`}
                    onSelect={() => handleQuestionSelect(q)}
                    className="text-sm cursor-pointer"
                  >
                    <HelpCircle className="h-3.5 w-3.5 mr-2 text-purple-400" />
                    <div className="flex flex-col">
                      <span>{q.label}</span>
                      <span className="text-[10px] text-slate-400 capitalize">{q.type}</span>
                    </div>
                  </CommandItem>
                ))}
              </ScrollArea>
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// --- Main Component ---
function WebDataGroupEditDialog({
  open,
  onOpenChange,
  group,
  onSave,
  masterFields,
  kycDocuments,
  jobQuestions
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  group: WebDataGroup | null;
  onSave: (updatedGroup: WebDataGroup) => void;
  masterFields: JobField[];
  kycDocuments: KYCDocument[];
  jobQuestions: any[];
}) {
  const [editingGroup, setEditingGroup] = useState<WebDataGroup | null>(null);
  const [addDocOpen, setAddDocOpen] = useState(false);

  useEffect(() => {
    if (group) {
      const initialDocuments = group.linkedKycDocuments && group.linkedKycDocuments.length > 0
        ? group.linkedKycDocuments
        : (group.kycDocumentId ? [group.kycDocumentId] : []);

      setEditingGroup({
        ...group,
        linkedKycDocuments: initialDocuments,
        documentLogic: group.documentLogic || 'merge',
        linkedJobQuestionIds: group.linkedJobQuestionIds || (group.linkedJobQuestionId ? [group.linkedJobQuestionId] : []),
        sourceLogic: group.sourceLogic || 'priority'
      });
    }
  }, [group, open]);

  if (!editingGroup) return null;

  const updateField = (key: keyof WebDataGroup, value: any) => {
    setEditingGroup(prev => prev ? ({ ...prev, [key]: value }) : null);
  };

  const linkMasterField = (field: JobField) => {
    if (editingGroup.linkedMasterFields?.includes(field.id)) return;
    updateField('linkedMasterFields', [...(editingGroup.linkedMasterFields || []), field.id]);
  };

  const unlinkMasterField = (fieldId: number) => {
    updateField('linkedMasterFields', (editingGroup.linkedMasterFields || []).filter(id => id !== fieldId));
  };

  const linkJobQuestion = (questionId: string) => {
    const current = editingGroup.linkedJobQuestionIds || [];
    if (current.includes(questionId)) return;
    updateField('linkedJobQuestionIds', [...current, questionId]);
  };

  const unlinkJobQuestion = (questionId: string) => {
    const current = editingGroup.linkedJobQuestionIds || [];
    updateField('linkedJobQuestionIds', current.filter(id => id !== questionId));
  };

  const moveItem = (listKey: 'linkedMasterFields' | 'linkedJobQuestionIds', index: number, direction: 'up' | 'down') => {
    const newList = [...(editingGroup[listKey] || [])] as any[];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= newList.length) return;
    [newList[index], newList[targetIndex]] = [newList[targetIndex], newList[index]];
    updateField(listKey, newList);
  };

  const isDocument = editingGroup.fieldType === 'document';
  const isComputed = editingGroup.fieldType === 'computed';
  const totalSources = (editingGroup.linkedMasterFields?.length || 0) + (editingGroup.linkedJobQuestionIds?.length || 0);

  const showExtractionMode = totalSources > 0 || isComputed || (editingGroup.fieldType === 'array' && (editingGroup.arrayItems?.length || 0) > 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col p-0 gap-0 border-none shadow-2xl">
        <DialogHeader className="px-6 py-4 bg-white border-b sticky top-0 z-10">
          <DialogTitle className="text-xl font-bold text-slate-900">Configure Field Mapping</DialogTitle>
          <DialogDescription>Define how system data maps to the automation variable.</DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 bg-slate-50/30">
          <div className="p-6 space-y-8">
            {/* --- Section 1: Basic Identity --- */}
            <div className="grid grid-cols-2 gap-6 bg-white p-4 rounded-xl border shadow-sm">
              <div className="space-y-1.5">
                <Label className="text-[11px] font-bold text-slate-500 uppercase tracking-tight">JSON Variable Key</Label>
                <div className="relative">
                  <Key className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <Input
                    value={editingGroup.variableName}
                    onChange={(e) => updateField('variableName', e.target.value)}
                    className="pl-9 font-mono text-sm bg-slate-50 border-slate-200"
                    placeholder="e.g. passport_number"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] font-bold text-slate-500 uppercase tracking-tight">UI Display Label</Label>
                <Input
                  value={editingGroup.efnsDisplayName}
                  onChange={(e) => updateField('efnsDisplayName', e.target.value)}
                  placeholder="e.g. Passport Number"
                  className="text-sm font-medium"
                />
              </div>
            </div>

            {/* --- Section 2: Type & Scope --- */}
            <div className="grid grid-cols-2 gap-6 items-end">
              <div className="space-y-1.5">
                <Label className="text-[11px] font-bold text-slate-500 uppercase tracking-tight">Data Type</Label>
                <Select value={editingGroup.fieldType} onValueChange={(v) => updateField('fieldType', v)}>
                  <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="text">Text (String)</SelectItem>
                    <SelectItem value="number">Number</SelectItem>
                    <SelectItem value="date">Date</SelectItem>
                    <SelectItem value="array">Array (List)</SelectItem>
                    <SelectItem value="document">Document (File)</SelectItem>
                    <SelectItem value="computed">Computed (Script)</SelectItem>
                  </SelectContent>
                </Select>

                {editingGroup.fieldType === 'date' && (
                  <div className="flex items-center gap-2 mt-2 bg-blue-50/50 p-2 rounded border border-blue-100 animate-in slide-in-from-top-1">
                    <Label className="text-[10px] font-bold text-blue-700">Format:</Label>
                    <Select value={editingGroup.dateFormat || 'iso'} onValueChange={(v) => updateField('dateFormat', v)}>
                      <SelectTrigger className="h-7 text-[10px] border-none bg-transparent focus:ring-0 w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="iso">YYYY-MM-DD</SelectItem>
                        <SelectItem value="object_split">Object &#123;d,m,y&#125;</SelectItem>
                        <SelectItem value="dd_mm_yyyy">DD/MM/YYYY</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] font-bold text-slate-500 uppercase tracking-tight">Entity Application</Label>
                <EntityConfigurator
                  group={editingGroup}
                  onUpdate={(updates) => Object.entries(updates).forEach(([k, v]) => updateField(k as any, v))}
                />
              </div>
            </div>

            {/* --- Section 3: Source Mapping (The Core) --- */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Label className="text-sm font-bold text-slate-800 uppercase tracking-wider">Source Configuration</Label>
                  <Badge variant="outline" className="text-[10px] bg-slate-100">{totalSources} Linked</Badge>
                </div>

                {totalSources > 1 && (
                  <div className="flex items-center gap-2 bg-white px-2 py-1 rounded-lg border shadow-sm animate-in fade-in zoom-in-95">
                    <Label className="text-[10px] font-bold text-slate-400 uppercase">Logic:</Label>
                    <Select
                      value={editingGroup.sourceLogic || 'priority'}
                      onValueChange={(v) => updateField('sourceLogic', v)}
                    >
                      <SelectTrigger className="h-7 w-[160px] text-xs border-none shadow-none focus:ring-0">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="priority">Fallback (Check Priority)</SelectItem>
                        <SelectItem value="all">Return All (Array)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              <div className="bg-slate-100/50 border rounded-xl p-4 shadow-inner min-h-[120px]">
                {isDocument ? (
                  /* --- Document Specific Logic --- */
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label className="text-[10px] font-bold text-slate-500 uppercase">File Condition</Label>
                        <Select value={editingGroup.documentLogic || 'merge'} onValueChange={(v) => updateField('documentLogic', v)}>
                          <SelectTrigger className="h-9 bg-white"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="merge">Merge (All types)</SelectItem>
                            <SelectItem value="fallback">Fallback (First available)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-[10px] font-bold text-slate-500 uppercase">Count Required</Label>
                        <Input
                          type="number"
                          placeholder="Optional"
                          value={editingGroup.documentCount || ''}
                          onChange={(e) => updateField('documentCount', e.target.value ? parseInt(e.target.value) : undefined)}
                          className="h-9 bg-white"
                        />
                      </div>
                    </div>
                    {/* Document list handled here */}
                    <div className="space-y-2">
                      <Label className="text-[10px] font-bold text-slate-500 uppercase">Linked KYC Documents</Label>
                      <div className="bg-white rounded-lg border p-2 space-y-1.5">
                        {editingGroup.linkedKycDocuments?.map((docId, index) => (
                          <div key={docId} className="flex items-center gap-2 p-1.5 rounded bg-slate-50 border text-sm">
                             <div className="flex flex-col">
                                <Button variant="ghost" size="icon" className="h-3 w-3" onClick={() => moveDocument(index, 'up')} disabled={index === 0}><ArrowUp className="h-2 w-2"/></Button>
                                <Button variant="ghost" size="icon" className="h-3 w-3" onClick={() => moveDocument(index, 'down')} disabled={index === editingGroup.linkedKycDocuments.length -1}><ArrowDown className="h-2 w-2"/></Button>
                             </div>
                             <FileText className="h-3.5 w-3.5 text-amber-500" />
                             <span className="flex-1 truncate">{kycDocuments.find(d => d.id === docId)?.display_name || docId}</span>
                             <Button variant="ghost" size="icon" className="h-6 w-6 text-red-400" onClick={() => removeDocument(docId)}><X className="h-3.5 w-3.5" /></Button>
                          </div>
                        ))}
                        <Popover open={addDocOpen} onOpenChange={setAddDocOpen}>
                          <PopoverTrigger asChild>
                            <Button variant="outline" size="sm" className="w-full border-dashed text-xs h-8 text-slate-500 hover:text-blue-600">
                              <Plus className="h-3 w-3 mr-1" /> Add Doc Type
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-[300px] p-0" align="start">
                            <Command>
                              <CommandInput placeholder="Search documents..." />
                              <CommandList className="max-h-[200px]">
                                {kycDocuments.map(doc => (
                                  <CommandItem key={doc.id} onSelect={() => addDocument(doc.id)} disabled={editingGroup.linkedKycDocuments?.includes(doc.id)}>
                                    <FileText className="h-3.5 w-3.5 mr-2" /> {doc.display_name}
                                  </CommandItem>
                                ))}
                              </CommandList>
                            </Command>
                          </PopoverContent>
                        </Popover>
                      </div>
                    </div>
                  </div>
                ) : isComputed ? (
                  <ComputedFieldConfig
                    group={editingGroup}
                    kycDocuments={kycDocuments}
                    onUpdate={(updates) => Object.entries(updates).forEach(([k, v]) => updateField(k as any, v))}
                  />
                ) : editingGroup.fieldType === 'array' ? (
                  <ArrayConfigurator
                    group={editingGroup}
                    masterFields={masterFields}
                    kycDocuments={kycDocuments}
                    jobQuestions={jobQuestions}
                    onUpdate={(items) => updateField('arrayItems', items)}
                  />
                ) : (
                  /* --- Standard Logic: Fields & Questions --- */
                  <div className="space-y-6">
                    <SourcePriorityManager
                      linkedMasterFields={editingGroup.linkedMasterFields}
                      linkedJobQuestionIds={editingGroup.linkedJobQuestionIds}
                      sourceLogic={editingGroup.sourceLogic || 'priority'}
                      masterFields={masterFields}
                      jobQuestions={jobQuestions}
                      onUpdate={updateField}
                      onMoveItem={moveItem}
                      onUnlinkMaster={unlinkMasterField}
                      onUnlinkQuestion={unlinkJobQuestion}
                    />

                    <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-200">
                      <div className="space-y-2">
                        <Label className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1.5">
                           <Database className="h-3 w-3" /> Add DB Field
                        </Label>
                        <MasterFieldPicker availableFields={masterFields} onSelect={linkMasterField} />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1.5">
                           <HelpCircle className="h-3 w-3" /> Add Question
                        </Label>
                        <MultiJobQuestionPicker
                          availableQuestions={jobQuestions}
                          linkedQuestionIds={editingGroup.linkedJobQuestionIds || []}
                          onSelect={linkJobQuestion}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Warnings and Info */}
              {totalSources > 1 && (
                <div className="p-3 bg-blue-50/80 border border-blue-100 rounded-lg flex gap-3 text-blue-700 animate-in slide-in-from-bottom-2">
                  <Info className="h-4 w-4 shrink-0 mt-0.5" />
                  <div className="text-[11px] leading-relaxed">
                    <strong>Note:</strong> {editingGroup.sourceLogic === 'all'
                      ? `This variable will be populated with an array of values from all ${totalSources} sources.`
                      : `The automation will attempt to find a value from these sources in order. If the highest priority source is empty, it falls back to the next.`
                    }
                  </div>
                </div>
              )}
            </div>

            {/* --- Section 4: Extraction Options --- */}
            <div className="space-y-4 pt-2">
              <div className="space-y-1.5">
                <Label className="text-[11px] font-bold text-slate-500 uppercase tracking-tight">Grouping Label (UI Helper)</Label>
                <Input
                  value={editingGroup.customFieldSource || ''}
                  onChange={(e) => updateField('customFieldSource', e.target.value)}
                  placeholder="e.g. Identity Documents"
                  className="bg-white"
                />
              </div>

              {showExtractionMode && !isDocument && (
                <div className="flex items-center justify-between p-3 bg-slate-100 rounded-lg border">
                  <div className="space-y-0.5">
                    <Label className="text-sm font-bold text-slate-700">Extraction Mode</Label>
                    <p className="text-[10px] text-slate-500 leading-tight">Does the automation receive one value or an array?</p>
                  </div>
                  <Select
                    value={editingGroup.extractionMode || 'latest'}
                    onValueChange={(v) => updateField('extractionMode', v)}
                  >
                    <SelectTrigger className="w-[140px] h-9 bg-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="latest">Single (Latest)</SelectItem>
                      <SelectItem value="all">Multiple (All)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </div>
        </ScrollArea>

        <DialogFooter className="px-6 py-4 bg-white border-t flex justify-end gap-3 sticky bottom-0 z-10">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Discard Changes</Button>
          <Button onClick={() => onSave(editingGroup)} className="bg-blue-600 hover:bg-blue-700 px-8 shadow-lg shadow-blue-100">
            Apply Configuration
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

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
              <span className={cn("text-sm  font-medium truncate", group.computedFunction ? "text-purple-700" : "text-slate-400 italic")}>
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
            <Label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              Function Name
            </Label>
            <div className="relative">
              <Calculator className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <Input
                value={group.computedFunction || ''}
                onChange={e => onUpdate({ computedFunction: e.target.value })}
                placeholder="e.g. calculateAgeFromId()"
                className="pl-9 h-9 text-sm  border-slate-200 focus:border-purple-400 focus:ring-purple-100"
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold text-slate-700">Required Documents</Label>
              <Badge variant="secondary" className="h-5 text-[10px] bg-purple-50 text-purple-700 border-purple-100">
                {selectedDocs.length} selected
              </Badge>
            </div>

            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <div className="bg-slate-50 px-3 py-2 border-b border-slate-200 flex items-center gap-2">
                <Search className="h-3.5 w-3.5 text-slate-400" />
                <Input
                  className="h-7 text-sm border-none shadow-none bg-transparent focus-visible:ring-0 p-0"
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
                      <p className="text-sm text-slate-400">No documents found matching "{docSearch}"</p>
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
                            <div className="text-sm font-medium text-slate-800 truncate group-hover:text-purple-700 transition-colors">
                              {doc.display_name}
                            </div>
                            <div className="text-[9px] text-slate-400  truncate">
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
            className="h-7 text-sm text-slate-500 hover:text-red-600 hover:bg-red-50"
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
          <CommandInput placeholder="Search database fields..." className="h-9 text-sm" />
          <CommandList>
            <CommandEmpty>No fields found.</CommandEmpty>
            <CommandGroup heading="Available Fields">
              <ScrollArea className="h-[200px]">
                {availableFields.map((field) => (
                  <CommandItem key={field.id} onSelect={() => { onSelect(field); setOpen(false) }} className="text-sm cursor-pointer">
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

// --- Helper: Multi-Select Master Field Picker ---
function MultiMasterFieldPicker({
  availableFields,
  linkedFieldIds,
  onSelect
}: {
  availableFields: JobField[];
  linkedFieldIds: number[];
  onSelect: (field: JobField) => void;
}) {
  const [open, setOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState("")

  const filteredFields = availableFields.filter(field =>
    field.label.toLowerCase().includes(searchTerm.toLowerCase())
  )

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" type="button" className="h-6 w-6 p-0 rounded-md hover:bg-blue-50 text-blue-500 transition-colors">
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-0" align="start">
        <div className="p-3 border-b">
          <Input
            placeholder="Search database fields..."
            className="h-9 text-sm"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <ScrollArea className="h-[200px]">
          <div className="p-1">
            {filteredFields.length === 0 ? (
              <div className="py-6 text-center text-sm text-slate-500">
                No fields found.
              </div>
            ) : (
              filteredFields.map((field) => {
                const isLinked = linkedFieldIds.includes(field.id);
                return (
                  <div
                    key={field.id}
                    className={cn(
                      "flex items-center gap-2 p-2 rounded-sm cursor-pointer text-sm",
                      isLinked ? "bg-slate-100 opacity-50 cursor-not-allowed" : "hover:bg-slate-100"
                    )}
                    onClick={() => {
                      if (!isLinked) {
                        onSelect(field);
                        setOpen(false);
                      }
                    }}
                  >
                    <Database className="h-3 w-3 mr-2 text-slate-400" />
                    <span className={cn("flex-1", isLinked && "line-through")}>
                      {field.label}
                    </span>
                    {isLinked && (
                      <Check className="h-3 w-3 text-green-600" />
                    )}
                  </div>
                );
              })
            )}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  )
}

// --- Helper: Multi-Select Document Picker ---
function MultiDocumentPicker({
  availableDocuments,
  linkedDocumentIds,
  onSelect
}: {
  availableDocuments: KYCDocument[];
  linkedDocumentIds: string[];
  onSelect: (doc: KYCDocument) => void;
}) {
  const [open, setOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState("")

  const filteredDocuments = availableDocuments.filter(doc =>
    (doc.display_name || doc.name).toLowerCase().includes(searchTerm.toLowerCase())
  )

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" type="button" className="h-6 w-6 p-0 rounded-md hover:bg-amber-50 text-amber-500 transition-colors">
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-0" align="start">
        <div className="p-3 border-b">
          <Input
            placeholder="Search documents..."
            className="h-9 text-sm"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <ScrollArea className="h-[200px]">
          <div className="p-1">
            {filteredDocuments.length === 0 ? (
              <div className="py-6 text-center text-sm text-slate-500">
                No documents found.
              </div>
            ) : (
              filteredDocuments.map((doc) => {
                const isLinked = linkedDocumentIds.includes(doc.id);
                return (
                  <div
                    key={doc.id}
                    className={cn(
                      "flex items-center gap-2 p-2 rounded-sm cursor-pointer text-sm",
                      isLinked ? "bg-slate-100 opacity-50 cursor-not-allowed" : "hover:bg-slate-100"
                    )}
                    onClick={() => {
                      if (!isLinked) {
                        onSelect(doc);
                        setOpen(false);
                      }
                    }}
                  >
                    <FileText className="h-3 w-3 mr-2 text-slate-400" />
                    <span className={cn("flex-1", isLinked && "line-through")}>
                      {doc.display_name || doc.name}
                    </span>
                    {isLinked && (
                      <Check className="h-3 w-3 text-green-600" />
                    )}
                  </div>
                );
              })
            )}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  )
}

// --- NEW COMPONENT: Bulk Paste Fields Dialog ---
function BulkPasteFieldsDialog({
  open,
  onOpenChange,
  onAdd
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (fields: Array<{ displayName: string; variableName: string }>) => void;
}) {
  const [pastedText, setPastedText] = useState("");
  const [previewFields, setPreviewFields] = useState<Array<{ displayName: string; variableName: string }>>([]);

  useEffect(() => {
    if (!open) {
      setPastedText("");
      setPreviewFields([]);
    }
  }, [open]);

  const handleTextChange = (text: string) => {
    setPastedText(text);

    // Parse the pasted text - split by newlines and filter empty lines
    const lines = text
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);

    // Generate preview with formatted names
    const fields = lines.map(line => ({
      displayName: formatDisplayName(line),
      variableName: formatVariableName(line)
    }));

    setPreviewFields(fields);
  };

  const handleAdd = () => {
    if (previewFields.length > 0) {
      onAdd(previewFields);
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[600px] p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 py-4 border-b bg-slate-50/50">
          <DialogTitle>Bulk Add Fields</DialogTitle>
          <DialogDescription>Paste a list of field names (one per line) to add multiple fields at once.</DialogDescription>
        </DialogHeader>

        <div className="p-6 space-y-4">
          <div className="space-y-2">
            <Label>Paste Field Names</Label>
            <Textarea
              placeholder="Paste field names here, one per line...&#10;Example:&#10;firstName&#10;lastName&#10;PinNo&#10;date_of_birth"
              className="min-h-[150px] font-mono text-sm"
              value={pastedText}
              onChange={(e) => handleTextChange(e.target.value)}
            />
            <p className="text-xs text-slate-500">
              Tip: Field names will be automatically formatted. For example, "PinNo" becomes "Pin No", "first_name" becomes "First Name"
            </p>
          </div>

          {previewFields.length > 0 && (
            <div className="space-y-2">
              <Label>Preview ({previewFields.length} fields)</Label>
              <ScrollArea className="h-[200px] border rounded-md bg-white">
                <div className="p-2 space-y-1">
                  {previewFields.map((field, idx) => (
                    <div key={idx} className="flex items-center justify-between p-2 bg-slate-50 rounded text-sm border border-slate-100">
                      <div className="flex-1">
                        <div className="font-medium text-slate-800">{field.displayName}</div>
                        <div className="text-xs text-slate-500 font-mono">{field.variableName}</div>
                      </div>
                      <Badge variant="secondary" className="text-xs">Empty Field</Badge>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          )}
        </div>

        <DialogFooter className="border-t p-4 bg-slate-50">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            size="sm"
            onClick={handleAdd}
            disabled={previewFields.length === 0}
          >
            Add {previewFields.length > 0 ? `${previewFields.length} ` : ''}Fields
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// --- NEW COMPONENT: Simplified Add Data Field Dialog ---

function AddDataFieldDialog({
  open,
  onOpenChange,
  onAdd,
  onOpenBulkPaste,
  masterFields,
  kycDocuments,
  jobQuestions,
  classRequirements,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (type: 'text' | 'document' | 'computed' | 'db' | 'job_question' | 'requirement', data?: any) => void;
  onOpenBulkPaste: () => void;
  masterFields: JobField[];
  kycDocuments: KYCDocument[];
  jobQuestions: any[];
  classRequirements: any;
}) {
  const [selectedTab, setSelectedTab] = useState("db");
  const [dbFieldOpen, setDbFieldOpen] = useState(false);
  const [docFieldOpen, setDocFieldOpen] = useState(false);
  const [selectedFields, setSelectedFields] = useState<number[]>([]);
  const [selectedDocuments, setSelectedDocuments] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [docSearchTerm, setDocSearchTerm] = useState("");
  const [reqSearchTerm, setReqSearchTerm] = useState("");
  const [selectedReqIds, setSelectedReqIds] = useState<string[]>([]);

  const filteredFields = masterFields.filter(field =>
    field.label.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredDocuments = kycDocuments.filter(doc =>
    (doc.display_name || '').toLowerCase().includes(docSearchTerm.toLowerCase())
  );

  const filteredRequirements = (classRequirements?.requirements || []).filter(req =>
    req.name.toLowerCase().includes(reqSearchTerm.toLowerCase()) ||
    req.category?.toLowerCase().includes(reqSearchTerm.toLowerCase())
  );

  const groupedRequirements = filteredRequirements.reduce((acc, req) => {
    const category = req.category || 'General';
    if (!acc[category]) acc[category] = [];
    acc[category].push(req);
    return acc;
  }, {} as Record<string, any[]>);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[750px] p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 py-4 border-b bg-slate-50/50">
          <DialogTitle>Add Data Field</DialogTitle>
          <DialogDescription>Select the type of data to map.</DialogDescription>
        </DialogHeader>

        <Tabs value={selectedTab} onValueChange={setSelectedTab} className="w-full">
          <TabsList className="w-full justify-start rounded-none border-b bg-white px-6 h-12 gap-6">
            <TabsTrigger value="db" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-blue-600 rounded-none h-full px-0">Database</TabsTrigger>
            <TabsTrigger value="doc" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-amber-500 rounded-none h-full px-0">Document</TabsTrigger>
            <TabsTrigger value="requirements" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-green-600 rounded-none h-full px-0">Requirements</TabsTrigger>
            <TabsTrigger value="job" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-purple-600 rounded-none h-full px-0">Job Question</TabsTrigger>
            <TabsTrigger value="manual" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-slate-600 rounded-none h-full px-0">Manual / Computed</TabsTrigger>
          </TabsList>

          <div className="p-6 min-h-[200px]">
            <TabsContent value="db" className="mt-0 space-y-4">
              <div className="bg-blue-50/50 p-3 rounded-lg border border-blue-100 mb-4 flex gap-3">
                <Database className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h4 className="text-sm font-semibold text-blue-900">Map from Database</h4>
                  <p className="text-xs text-blue-700">Select an existing field from the database to map automatically.</p>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Select Field</Label>
                <Popover open={dbFieldOpen} onOpenChange={setDbFieldOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
                      {selectedFields?.length > 0
                        ? `${selectedFields.length} field${selectedFields.length > 1 ? 's' : ''} selected`
                        : "Select fields..."
                      }
                      <Search className="ml-2 h-4 w-4 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[450px] p-0" align="start">
                    <div className="p-3 border-b">
                      <Input
                        placeholder="Search database fields..."
                        className="h-9 text-sm"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                      />
                    </div>
                    <ScrollArea className="h-[200px]">
                      <div className="p-1">
                        {filteredFields.length === 0 ? (
                          <div className="py-6 text-center text-sm text-slate-500">
                            No field found.
                          </div>
                        ) : (
                          filteredFields.map((field) => (
                            <div
                              key={field.id}
                              className="flex items-center gap-2 p-2 rounded-sm hover:bg-slate-100 cursor-pointer"
                              onClick={() => {
                                const isSelected = selectedFields?.includes(field.id);
                                if (isSelected) {
                                  setSelectedFields(selectedFields.filter(id => id !== field.id));
                                } else {
                                  setSelectedFields([...(selectedFields || []), field.id]);
                                }
                              }}
                            >
                              <Check className={cn(
                                "h-4 w-4",
                                selectedFields?.includes(field.id) ? "opacity-100" : "opacity-0"
                              )} />
                              <Database className="h-4 w-4 text-slate-400" />
                              <span className="text-sm">{field.label}</span>
                            </div>
                          ))
                        )}
                      </div>
                    </ScrollArea>
                    {selectedFields && selectedFields.length > 0 && (
                      <div className="border-t p-2">
                        <Button
                          size="sm"
                          className="w-full"
                          onClick={() => {
                            selectedFields.forEach(fieldId => {
                              const field = masterFields.find(f => f.id === fieldId);
                              if (field) onAdd('db', field);
                            });
                            setSelectedFields([]);
                            setDbFieldOpen(false);
                          }}
                        >
                          Add {selectedFields.length} Selected Fields
                        </Button>
                      </div>
                    )}
                  </PopoverContent>
                </Popover>
              </div>
            </TabsContent>

            <TabsContent value="doc" className="mt-0 space-y-4">
              <div className="bg-amber-50/50 p-3 rounded-lg border border-amber-100 mb-4 flex gap-3">
                <Paperclip className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h4 className="text-sm font-semibold text-amber-900">Upload Attachment</h4>
                  <p className="text-xs text-amber-700">Map a document upload field (e.g. Passport Scan).</p>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Select Document Type</Label>
                <Popover open={docFieldOpen} onOpenChange={setDocFieldOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" role="combobox" aria-expanded={docFieldOpen} className="w-full justify-between font-normal">
                      {selectedDocuments?.length > 0
                        ? `${selectedDocuments.length} document${selectedDocuments.length > 1 ? 's' : ''} selected`
                        : "Select documents..."
                      }
                      <Search className="ml-2 h-4 w-4 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[450px] p-0" align="start">
                    <div className="p-3 border-b">
                      <Input
                        placeholder="Search documents..."
                        className="h-9 text-sm"
                        value={docSearchTerm}
                        onChange={(e) => setDocSearchTerm(e.target.value)}
                      />
                    </div>
                    <ScrollArea className="h-[200px]">
                      <div className="p-1">
                        {filteredDocuments.length === 0 ? (
                          <div className="py-6 text-center text-sm text-slate-500">
                            No document found.
                          </div>
                        ) : (
                          filteredDocuments.map((doc) => (
                            <div
                              key={doc.id}
                              className="flex items-center gap-2 p-2 rounded-sm hover:bg-slate-100 cursor-pointer"
                              onClick={() => {
                                const isSelected = selectedDocuments?.includes(doc.id);
                                if (isSelected) {
                                  setSelectedDocuments(selectedDocuments.filter(id => id !== doc.id));
                                } else {
                                  setSelectedDocuments([...(selectedDocuments || []), doc.id]);
                                }
                              }}
                            >
                              <Check className={cn(
                                "h-4 w-4",
                                selectedDocuments?.includes(doc.id) ? "opacity-100" : "opacity-0"
                              )} />
                              <FileText className="h-4 w-4 text-amber-400" />
                              <span className="text-sm">{doc.display_name || 'Unnamed Document'}</span>
                            </div>
                          ))
                        )}
                      </div>
                    </ScrollArea>
                    {selectedDocuments && selectedDocuments.length > 0 && (
                      <div className="border-t p-2">
                        <Button
                          size="sm"
                          className="w-full"
                          onClick={() => {
                            selectedDocuments.forEach(docId => {
                              const doc = kycDocuments.find(d => d.id === docId);
                              if (doc) onAdd('document', doc);
                            });
                            setSelectedDocuments([]);
                            setDocFieldOpen(false);
                          }}
                        >
                          Add {selectedDocuments.length} Selected Documents
                        </Button>
                      </div>
                    )}
                  </PopoverContent>
                </Popover>
              </div>
            </TabsContent>

            <TabsContent value="manual" className="mt-0 grid grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => {
                  onOpenChange(false);
                  onOpenBulkPaste();
                }}
                className="relative flex flex-col items-start p-4 bg-white border border-slate-200 rounded-xl hover:border-blue-400 hover:shadow-md hover:shadow-blue-50 transition-all group text-left"
              >
                <div className="h-10 w-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                  <Type className="h-5 w-5" />
                </div>
                <div className="font-semibold text-sm text-slate-800">Empty Field</div>
                <div className="text-[11px] text-slate-500 leading-tight mt-1">
                  Create placeholder variables. Paste a list to add multiple fields at once.
                </div>
              </button>

              <button
                type="button"
                onClick={() => onAdd('computed')}
                className="relative flex flex-col items-start p-4 bg-white border border-slate-200 rounded-xl hover:border-purple-400 hover:shadow-md hover:shadow-purple-50 transition-all group text-left"
              >
                <div className="h-10 w-10 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                  <Calculator className="h-5 w-5" />
                </div>
                <div className="font-semibold text-sm text-slate-800">Computed Logic</div>
                <div className="text-[11px] text-slate-500 leading-tight mt-1">
                  Calculate values server-side (e.g. Age) before automation runs.
                </div>
              </button>
            </TabsContent>

            <TabsContent value="requirements" className="mt-0 space-y-4">
              <div className="bg-green-50/50 p-3 rounded-lg border border-green-100 mb-4 flex gap-3">
                <Shield className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1 space-y-1">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-green-900">Map Mandatory Requirements</h4>
                    <div className="flex gap-2">
                      {filteredRequirements.length > 0 && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-[11px] font-bold text-green-700 hover:bg-green-100 uppercase"
                          onClick={() => {
                            if (selectedReqIds.length === filteredRequirements.length) {
                              setSelectedReqIds([]);
                            } else {
                              setSelectedReqIds(filteredRequirements.map(r => r.id));
                            }
                          }}
                        >
                          {selectedReqIds.length === filteredRequirements.length ? "Deselect All" : `Select All (${filteredRequirements.length})`}
                        </Button>
                      )}
                      {selectedReqIds.length > 0 && (
                        <Button
                          size="sm"
                          className="h-7 text-[11px] font-bold bg-green-600 hover:bg-green-700 text-white uppercase"
                          onClick={() => {
                            selectedReqIds.forEach(id => {
                              const req = classRequirements.requirements.find(r => r.id === id);
                              if (req) onAdd('requirement', req);
                            });
                            setSelectedReqIds([]);
                          }}
                        >
                          Add Selected ({selectedReqIds.length})
                        </Button>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-green-700">Quickly add mandatory documents defined for this job level.</p>
                </div>
              </div>

              <div className="relative mb-2">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="Search requirements or categories..."
                  className="pl-9 h-10 text-sm border-slate-200"
                  value={reqSearchTerm}
                  onChange={(e) => setReqSearchTerm(e.target.value)}
                />
              </div>

              <ScrollArea className="h-[350px] border rounded-md bg-white">
                {Object.keys(groupedRequirements).length === 0 ? (
                  <div className="p-12 text-center text-slate-400">
                    <Shield className="h-10 w-10 mx-auto mb-2 opacity-10" />
                    <p>No requirements found matching your search.</p>
                  </div>
                ) : (
                  <div className="p-2 space-y-4">
                    {Object.entries(groupedRequirements).map(([category, reqs]) => (
                      <div key={category} className="space-y-1.5">
                        <div className="px-2 py-1 flex items-center justify-between">
                          <Label className="text-[11px] font-extrabold text-slate-900 uppercase tracking-widest">{category}</Label>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-5 px-2 text-[9px] text-blue-600 hover:bg-blue-50"
                            onClick={() => reqs.forEach(req => onAdd('requirement', req))}
                          >
                            Add Category
                          </Button>
                        </div>
                        <div className="flex flex-col gap-2">
                          {reqs.map(req => {
                            const isSelected = selectedReqIds.includes(req.id);
                            return (
                              <div
                                key={req.id}
                                className={cn(
                                  "p-3 bg-white border rounded-lg transition-all cursor-pointer group relative flex items-center gap-3",
                                  isSelected ? "border-green-500 bg-green-50/30" : "border-slate-100 hover:border-green-300 hover:shadow-md hover:shadow-green-50"
                                )}
                                onClick={() => {
                                  setSelectedReqIds(prev =>
                                    prev.includes(req.id)
                                      ? prev.filter(id => id !== req.id)
                                      : [...prev, req.id]
                                  );
                                }}
                              >
                                <Checkbox
                                  checked={isSelected}
                                  onCheckedChange={() => { }} // logic handled by parent div
                                  className="data-[state=checked]:bg-green-600 data-[state=checked]:border-green-600"
                                />
                                <div className="h-8 w-8 rounded bg-green-50 text-green-600 flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
                                  <FileText className="h-4 w-4" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="text-sm font-semibold text-slate-800 truncate">{req.name}</div>
                                  <div className="text-[10px] text-slate-500 mt-0.5 flex items-center gap-1.5">
                                    <span className="bg-slate-100 px-1 rounded">{req.document_ids?.length || 0} Docs</span>
                                    <span className="w-1 h-1 bg-slate-300 rounded-full" />
                                    <span className="truncate">{req.applicantTypes?.join(', ')}</span>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </TabsContent>

            <TabsContent value="job" className="mt-0 space-y-4">
              <div className="bg-purple-50/50 p-3 rounded-lg border border-purple-100 mb-4 flex gap-3">
                <HelpCircle className="h-5 w-5 text-purple-600 flex-shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h4 className="text-sm font-semibold text-purple-900">Map from Job Question</h4>
                  <p className="text-xs text-purple-700">Map the answer of a job-specific question to this key.</p>
                </div>
              </div>
              <ScrollArea className="h-[200px] border rounded-md bg-white">
                {jobQuestions.map(q => (
                  <div
                    key={q.id}
                    className="p-2 hover:bg-slate-50 cursor-pointer flex items-center gap-2 border-b last:border-0"
                    onClick={() => onAdd('job_question', q)}
                  >
                    <HelpCircle className="h-4 w-4 text-purple-400" />
                    <span className="text-sm">{q.label}</span>
                  </div>
                ))}
              </ScrollArea>
            </TabsContent>

          </div>
        </Tabs>
        <DialogFooter className="border-t p-2 bg-slate-50">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// --- rest of the code remains the same ...

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
  const [showPassword, setShowPassword] = useState(false)
  const [webDataGroups, setWebDataGroups] = useState<WebDataGroup[]>([])
  const [masterFields, setMasterFields] = useState<JobField[]>([])
  const [kycDocuments, setKycDocuments] = useState<KYCDocument[]>([])
  const [jobQuestions, setJobQuestions] = useState<any[]>([]);
  const [classRequirements, setClassRequirements] = useState<any>(null);
  const [isAddFieldOpen, setIsAddFieldOpen] = useState(false)
  const [isBulkPasteOpen, setIsBulkPasteOpen] = useState(false)
  const [fieldSearch, setFieldSearch] = useState('')
  const [deleteGroupDialogOpen, setDeleteGroupDialogOpen] = useState(false);
  const [groupToDelete, setGroupToDelete] = useState<string | null>(null);
  const [deleteFlowDialogOpen, setDeleteFlowDialogOpen] = useState(false);

  // Editing State
  const [editingGroup, setEditingGroup] = useState<WebDataGroup | null>(null);
  const [isEditDialogopen, setIsEditDialogopen] = useState(false);

  // Sorting State
  const [sortConfig, setSortConfig] = useState<{ key: string | null, direction: 'asc' | 'desc' }>({ key: null, direction: 'asc' });

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

  // ... existing code around line 1056 ...

  useEffect(() => {
    const fetchQuestions = async () => {
      const { data } = await supabase.from('tm_class_requirements').select('job_specific_questions');
      // Flatten and get unique labels
      const allQuestions = data?.flatMap(r => r.job_specific_questions || []) || [];
      const unique = Array.from(new Map(allQuestions.map(q => [q.label, q])).values());

      // LOG: Fallback/General Questions
      console.log('🔍 [Automation Dialog] Loaded Global Fallback Job Questions:', unique);

      setJobQuestions(unique);
    };
    fetchQuestions();
  }, [isOpen]);

  useEffect(() => {
    const fetchContextualData = async () => {
      if (!isOpen) return;

      // 1. Fetch Job Fields and KYC as usual
      const [fieldsRes, kycRes] = await Promise.all([
        supabase.from('tm_job_fields').select('*').order('label'),
        supabase.from('acc_portal_kyc').select('*').order('display_name')
      ]);
      setMasterFields(fieldsRes.data || []);
      setKycDocuments(kycRes.data || []);

      // 2. Fetch Job Questions matching the automation's job_level
      if (initialData?.job_level) {
        const jobLevelString = typeof initialData.job_level === 'string'
          ? initialData.job_level
          : JSON.stringify(initialData.job_level);

        const { data, error } = await supabase
          .from('tm_class_requirements')
          .select('*')
          .eq('job_level', jobLevelString)
          .maybeSingle();

        if (error) {
          console.error(`❌ [Automation Dialog] Error fetching requirements for "${initialData.name}":`, error);
        } else {
          // LOG: Contextual Questions for this specific automation
          console.log(`🎯 [Automation Dialog] Contextual Load for "${initialData.name}"`);
          console.log(`   - Job Level:`, initialData.job_level);
          console.log(`   - Questions Found:`, data?.job_specific_questions || []);

          setJobQuestions(data?.job_specific_questions || []);
          setClassRequirements(data || null);
        }
      } else {
        console.log(`ℹ️ [Automation Dialog] No Job Level defined for "${initialData?.name || 'New Automation'}". Using global question list.`);
        setJobQuestions([]);
        setClassRequirements(null);
      }
    };

    fetchContextualData();
  }, [isOpen, initialData]);

  // ... existing code ...
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
          linkedMasterFields: g.linkedMasterFields || g.masterFieldIds || [],
          // Normalize legacy kycDocumentId to array
          linkedKycDocuments: g.linkedKycDocuments ? g.linkedKycDocuments : (g.kycDocumentId ? [g.kycDocumentId] : []),
          documentLogic: g.documentLogic || 'merge',
          kycDocumentId: g.kycDocumentId || undefined,
          fieldType: g.fieldType || 'text',
          customFieldSource: g.customFieldSource || '',
          dependantRelationships: g.dependantRelationships || [],
          directorType: g.directorType || 'all',
          extractionMode: g.extractionMode || 'latest',
          entityTypes: Array.isArray(g.entityTypes)
            ? g.entityTypes
            : (g.entityType ? [g.entityType] : []),
          // Migrate array items to include entity scope fields
          arrayItems: g.arrayItems ? g.arrayItems.map((item: any) => ({
            ...item,
            displayName: item.displayName || item.name || formatDisplayName(item.variableName) || '',
            entityTypes: item.entityTypes || g.entityTypes || ['principal'],
            dependantRelationships: item.dependantRelationships || [],
            directorType: item.directorType || undefined
          })) : []
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

  const removeGroup = (id: string) => {
    setGroupToDelete(id);
    setDeleteGroupDialogOpen(true);
  };

  const confirmRemoveGroup = () => {
    if (groupToDelete) {
      setWebDataGroups(prev => prev.filter(g => g.id !== groupToDelete));
      setDeleteGroupDialogOpen(false);
      setGroupToDelete(null);
    }
  };

  // --- Conceptual Drag-and-Drop Handler ---
  // In a real implementation using a library like dnd-kit, this function would be the onDragEnd callback.
  // It simulates the result of a row being dragged and dropped.
  const handleDragEnd = (activeId: string, overId: string) => {
    const oldIndex = webDataGroups.findIndex(g => g.id === activeId);
    const newIndex = webDataGroups.findIndex(g => g.id === overId);

    if (oldIndex !== newIndex && oldIndex !== -1 && newIndex !== -1) {
      const newGroups = [...webDataGroups];
      const [movedItem] = newGroups.splice(oldIndex, 1);
      newGroups.splice(newIndex, 0, movedItem);
      setWebDataGroups(newGroups);
      toast({ title: "Order Updated", description: "Field order updated via drag and drop (conceptual)." });
    }
  };


  // --- Sorting & Reordering Logic ---
  const handleSort = (key: string) => {
    setSortConfig(current => {
      if (current.key === key) {
        // If sorting by the same key, toggle direction. If asc, go to desc. If desc, clear sort.
        if (current.direction === 'asc') {
          return { key, direction: 'desc' };
        } else {
          // Clear sort on third click (desc -> null)
          return { key: null, direction: 'asc' };
        }
      }
      return { key, direction: 'asc' };
    });
  };

  // --- Re-introduced for single-step reordering behind the drag handle/index ---
  const moveRow = (index: number, direction: 'up' | 'down') => {
    // Reordering is only allowed when NO sort is active to avoid index confusion
    if (sortConfig.key) {
      toast({ title: "Cannot reorder while sorted", description: "Clear the sort (click the header until arrow disappears) to reorder.", variant: "destructive" });
      return;
    }

    const newGroups = [...webDataGroups];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;

    if (targetIndex < 0 || targetIndex >= newGroups.length) return;

    [newGroups[index], newGroups[targetIndex]] = [newGroups[targetIndex], newGroups[index]];
    setWebDataGroups(newGroups);
  };

  const processedWebDataGroups = useMemo(() => {
    let groups = [...webDataGroups];

    // Filter
    if (fieldSearch) {
      const lower = fieldSearch.toLowerCase();
      groups = groups.filter(g =>
        (g.variableName && g.variableName.toLowerCase().includes(lower)) ||
        (g.efnsDisplayName && g.efnsDisplayName.toLowerCase().includes(lower))
      );
    }

    // Sort
    if (sortConfig.key) {
      groups.sort((a, b) => {
        let aVal = a[sortConfig.key as keyof WebDataGroup] || '';
        let bVal = b[sortConfig.key as keyof WebDataGroup] || '';

        // Special handling for nested checks if needed, simplistic for now
        if (typeof aVal === 'string') aVal = aVal.toLowerCase();
        if (typeof bVal === 'string') bVal = bVal.toLowerCase();

        if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return groups;
  }, [webDataGroups, fieldSearch, sortConfig]);

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
          ? (group.linkedKycDocuments || []).map(id => kycDocuments.find(d => d.id === id)?.display_name).join(', ')
          : group.fieldType === 'array'
            ? `Array with ${group.arrayItems?.length || 0} items`
            : group.fieldType === 'computed'
              ? `Function: ${group.computedFunction || 'Not configured'}`
              : group.linkedMasterFields?.map(fieldId => {
                const field = masterFields.find(f => f.id === fieldId);
                return field?.label || 'Unknown Field';
              }).join(', ') || 'None',
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
        webdata: webDataGroups.map(g => ({
          ...g,
          linkedMasterFields: g.linkedMasterFields || []
        })),
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
    setDeleteFlowDialogOpen(true);
  };

  const confirmDeleteFlow = async () => {
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
      setDeleteFlowDialogOpen(false);
    }
  };

  const handleAddData = (type: 'text' | 'document' | 'computed' | 'db' | 'job_question' | 'requirement', data?: any) => {
    if (type === 'db' && data) {
      setWebDataGroups(prev => [...prev, {
        id: crypto.randomUUID(),
        efnsDisplayName: formatDisplayName(data.label),
        variableName: formatVariableName(data.field_key),
        fieldType: 'text',
        entityTypes: ['principal'],
        linkedMasterFields: [data.id],
        linkedJobQuestionId: data.id
      }]);
    } else if (type === 'document' && data) {
      setWebDataGroups(prev => [...prev, {
        id: crypto.randomUUID(),
        efnsDisplayName: formatDisplayName(data.display_name),
        variableName: formatVariableName(data.name),
        fieldType: 'document',
        entityTypes: ['principal'],
        linkedMasterFields: [],
        kycDocumentId: data.id,
        linkedKycDocuments: [data.id], // Initialize array
        documentLogic: 'merge',
        linkedJobQuestionId: data.label
      }]);
    } else if (type === 'job_question' && data) {
      setWebDataGroups(prev => [...prev, {
        id: crypto.randomUUID(),
        efnsDisplayName: formatDisplayName(data.label),
        variableName: formatVariableName(data.label),
        fieldType: 'text',
        entityTypes: ['principal'],
        linkedMasterFields: [],
        linkedJobQuestionId: data.id
      }]);
    } else if (type === 'requirement' && data) {
      setWebDataGroups(prev => [...prev, {
        id: crypto.randomUUID(),
        efnsDisplayName: formatDisplayName(data.name),
        variableName: formatVariableName(data.name),
        fieldType: 'document',
        entityTypes: (data.applicantTypes && data.applicantTypes.length > 0) ? data.applicantTypes : ['principal'],
        linkedMasterFields: [],
        linkedKycDocuments: data.document_ids || [],
        documentLogic: 'merge',
        linkedJobQuestionId: data.id
      }]);
    } else {
      const newRow: WebDataGroup = {
        id: crypto.randomUUID(),
        efnsDisplayName: type === 'computed' ? 'Computed Field' : 'New Field',
        variableName: '',
        fieldType: type === 'computed' ? 'computed' : 'text',
        entityTypes: ['principal'],
        linkedMasterFields: [],
        arrayItems: []
      };
      setWebDataGroups(prev => [...prev, newRow]);
    }
    setIsAddFieldOpen(false);
  }

  const handleBulkAddFields = (fields: Array<{ displayName: string; variableName: string }>) => {
    const newGroups = fields.map(field => ({
      id: crypto.randomUUID(),
      efnsDisplayName: field.displayName,
      variableName: field.variableName,
      fieldType: 'text' as const,
      entityTypes: ['principal'],
      linkedMasterFields: [],
      arrayItems: []
    }));
    setWebDataGroups(prev => [...prev, ...newGroups]);
    toast({
      title: "Success",
      description: `Added ${fields.length} field${fields.length > 1 ? 's' : ''} successfully`
    });
  }

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
        <DialogContent className="max-w-[67vw] h-[90vh] flex flex-col p-0 overflow-hidden bg-slate-50 border-none shadow-2xl rounded-xl">
          <DialogHeader className="px-6 py-4 bg-white border-b flex-shrink-0 flex-row items-center justify-between space-y-0 z-20">
            <div className="flex items-center gap-4">
              <div className="h-10 w-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-200">
                <Settings2 className="h-5 w-5 text-white" />
              </div>
              <div>
                <DialogTitle className="text-xl font-bold text-slate-900">
                  {initialData ? (
                    <>
                      Edit Automation: <span className="text-blue-600">{form.watch('name') || initialData.name}</span>
                    </>
                  ) : (
                    'Create Automation Flow'
                  )}
                </DialogTitle>
                <DialogDescription className="text-sm text-slate-500 mt-0.5 font-medium">
                  Configure connection details and map database fields to the target system.
                </DialogDescription>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200">
                <span className="text-sm font-semibold text-slate-600">Status:</span>
                <Switch
                  checked={form.watch('is_active')}
                  onCheckedChange={(c) => form.setValue('is_active', c)}
                  className="data-[state=checked]:bg-green-500"
                />
                <span className={cn("text-sm font-bold", form.watch('is_active') ? "text-green-600" : "text-slate-400")}>
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
                      "px-6 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2",
                      activeTab === 'general' ? "bg-white shadow-sm text-blue-700" : "text-slate-500 hover:text-slate-700 hover:bg-slate-200/50"
                    )}
                  >
                    <LayoutGrid className="h-3.5 w-3.5" /> General Settings
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('webdata')}
                    className={cn(
                      "px-6 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2",
                      activeTab === 'webdata' ? "bg-white shadow-sm text-blue-700" : "text-slate-500 hover:text-slate-700 hover:bg-slate-200/50"
                    )}
                  >
                    <List className="h-3.5 w-3.5" /> Data Mapping
                    <Badge className={cn("ml-1 h-4 px-1 rounded text-[9px]", activeTab === 'webdata' ? "bg-blue-100 text-blue-700 hover:bg-blue-200" : "bg-slate-200 text-slate-600")}>
                      {webDataGroups.length}
                    </Badge>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('requirements')}
                    className={cn(
                      "px-6 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2",
                      activeTab === 'requirements' ? "bg-white shadow-sm text-blue-700" : "text-slate-500 hover:text-slate-700 hover:bg-slate-200/50"
                    )}
                  >
                    <Shield className="h-3.5 w-3.5" /> Requirements
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-hidden relative bg-slate-50/50">
                {activeTab === 'general' && (
                  <ScrollArea className="h-full">
                    <div className="p-8 mx-auto space-y-6">
                      <Card className="border-none shadow-sm ring-1 ring-slate-200">
                        <CardHeader className="pb-4 border-b">
                          <CardTitle className="font-bold flex items-center gap-2">
                            <FileText className="h-6 w-6 text-blue-500" /> Basic Information
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="grid grid-cols-2 gap-6 pt-6">
                          <FormField
                            control={form.control}
                            name="name"
                            render={({ field }) => (
                              <FormItem className="col-span-1">
                                <FormLabel className="text-sm font-bold text-slate-500 uppercase">Automation Name</FormLabel>
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
                                <FormLabel className="text-sm font-bold text-slate-500 uppercase">Category</FormLabel>
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
                                <FormLabel className="text-sm font-bold text-slate-500 uppercase">Description</FormLabel>
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
                            <CardTitle className="font-bold flex items-center gap-2">
                              <Globe className="h-6 w-6 text-purple-500" /> Connection & Security
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="space-y-4 pt-6">
                            <div className="flex gap-3">
                              <FormField
                                control={form.control}
                                name="webhook_method"
                                render={({ field }) => (
                                  <FormItem className="w-28">
                                    <FormLabel className="text-sm font-bold text-slate-500">Method</FormLabel>
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
                                    <FormLabel className="text-sm font-bold text-slate-500">Endpoint URL</FormLabel>
                                    <FormControl><Input placeholder="https://api..." {...field} className=" text-sm" /></FormControl>
                                  </FormItem>
                                )}
                              />
                            </div>
                            <div className="grid grid-cols-2 gap-4 pt-2">
                              <FormField control={form.control} name="max_concurrent_runs" render={({ field }) => (
                                <FormItem>
                                  <FormLabel className="text-sm font-bold text-slate-500">Concurrency</FormLabel>
                                  <FormControl><Input type="number" {...field} onChange={e => field.onChange(Number(e.target.value))} /></FormControl>
                                </FormItem>
                              )} />
                              <FormField control={form.control} name="queue_priority" render={({ field }) => (
                                <FormItem>
                                  <FormLabel className="text-sm font-bold text-slate-500">Priority</FormLabel>
                                  <FormControl><Input type="number" {...field} onChange={e => field.onChange(Number(e.target.value))} /></FormControl>
                                </FormItem>
                              )} />
                            </div>
                          </CardContent>
                        </Card>

                        <Card className="border-none shadow-sm ring-1 ring-slate-200 h-full">
                          <CardHeader className="pb-4 border-b bg-slate-50/50">
                            <CardTitle className="font-bold flex items-center gap-2">
                              <Key className="h-6 w-6 text-amber-500" /> Authentication
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="space-y-4 pt-6">
                            {initialData?.id && (
                              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                                <div className="flex items-center gap-2">
                                  <Key className="h-4 w-4 text-amber-600" />
                                  <div className="text-sm">
                                    <span className="font-semibold text-amber-800">Field ID:</span>
                                    <span className="ml-2 font-mono text-amber-700 bg-amber-100 px-2 py-1 rounded">
                                      {initialData.id}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            )}
                            <FormField control={form.control} name="login.url" render={({ field }) => (
                              <FormItem><FormLabel className="text-sm font-bold text-slate-500">Login Page URL</FormLabel><FormControl><Input {...field} placeholder="https://login..." /></FormControl></FormItem>
                            )} />
                            <div className="grid grid-cols-2 gap-4">
                              <FormField control={form.control} name="login.email" render={({ field }) => (
                                <FormItem><FormLabel className="text-sm font-bold text-slate-500">Username/Email</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>
                              )} />
                              <FormField control={form.control} name="login.idNumber" render={({ field }) => (
                                <FormItem><FormLabel className="text-sm font-bold text-slate-500">Registration Document Number</FormLabel><FormControl><Input {...field} placeholder="e.g. Company Registration Number" /></FormControl></FormItem>
                              )} />
                            </div>
                            <FormField control={form.control} name="login.password" render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-sm font-bold text-slate-500">Password</FormLabel>
                                <FormControl>
                                  <div className="relative">
                                    <Input
                                      type={showPassword ? "text" : "password"}
                                      {...field}
                                      className="pr-10"
                                    />
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                                      onClick={() => setShowPassword(!showPassword)}
                                    >
                                      {showPassword ? (
                                        <EyeOff className="h-4 w-4 text-slate-400" />
                                      ) : (
                                        <Eye className="h-4 w-4 text-slate-400" />
                                      )}
                                    </Button>
                                  </div>
                                </FormControl>
                              </FormItem>
                            )} />
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
                            className="h-9 pl-9 text-sm bg-slate-50 border-slate-200 focus:bg-white transition-all"
                            value={fieldSearch}
                            onChange={e => setFieldSearch(e.target.value)}
                          />
                        </div>
                      </div>

                      <Button type="button" size="sm" variant="outline" onClick={handleExportToExcel} className="h-9 text-sm text-slate-600 border-slate-200 hover:bg-slate-50">
                        <FileSpreadsheet className="h-3.5 w-3.5 mr-2 text-green-600" /> Export
                      </Button>
                    </div>

                    <div className="flex-1 overflow-hidden p-6">
                      <div className="h-full border border-slate-200 rounded-lg shadow-sm bg-white overflow-hidden flex flex-col">
                        <ScrollArea className="flex-1 w-full">
                          <Table className="w-full border-collapse">
                            <TableHeader className="bg-blue-600 sticky top-0 z-10 backdrop-blur-sm border-b border-slate-200">
                              <TableRow className="hover:bg-transparent border-none">
                                <TableHead className="w-[80px] text-center h-10 font-bold text-white border-r uppercase tracking-wider">
                                  #
                                </TableHead>
                                <TableHead
                                  className="w-[250px] h-10 font-bold text-white border-r uppercase tracking-wider pl-4 cursor-pointer hover:bg-blue-700 transition-colors"
                                  onClick={() => handleSort('variableName')}
                                >
                                  <div className="flex items-center justify-between">
                                    Target Key
                                    {sortConfig.key === 'variableName' && (
                                      sortConfig.direction === 'asc' ? <ArrowUp className="h-3 w-3 opacity-80" /> : <ArrowDown className="h-3 w-3 opacity-80" />
                                    )}
                                    {sortConfig.key !== 'variableName' && <ArrowUpDown className="h-3 w-3 opacity-30" />}
                                  </div>
                                </TableHead>
                                <TableHead
                                  className="w-[250px] h-10 font-bold text-white border-r uppercase tracking-wider pl-4 cursor-pointer hover:bg-blue-700 transition-colors"
                                  onClick={() => handleSort('efnsDisplayName')}
                                >
                                  <div className="flex items-center justify-between">
                                    Display Label
                                    {sortConfig.key === 'efnsDisplayName' && (
                                      sortConfig.direction === 'asc' ? <ArrowUp className="h-3 w-3 opacity-80" /> : <ArrowDown className="h-3 w-3 opacity-80" />
                                    )}
                                    {sortConfig.key !== 'efnsDisplayName' && <ArrowUpDown className="h-3 w-3 opacity-30" />}
                                  </div>
                                </TableHead>
                                <TableHead
                                  className="w-[150px] h-10 font-bold text-white border-r uppercase tracking-wider pl-4 cursor-pointer hover:bg-blue-700 transition-colors"
                                  onClick={() => handleSort('fieldType')}
                                >
                                  <div className="flex items-center justify-between">
                                    Type
                                    {sortConfig.key === 'fieldType' && (
                                      sortConfig.direction === 'asc' ? <ArrowUp className="h-3 w-3 opacity-80" /> : <ArrowDown className="h-3 w-3 opacity-80" />
                                    )}
                                    {sortConfig.key !== 'fieldType' && <ArrowUpDown className="h-3 w-3 opacity-30" />}
                                  </div>
                                </TableHead>
                                <TableHead className="w-[150px] h-10 font-bold text-white border-r uppercase tracking-wider pl-4">Entities</TableHead>
                                <TableHead className="w-[150px] h-10 font-bold text-white border-r uppercase tracking-wider pl-4">Custom Source</TableHead>
                                <TableHead className="w-[150px] h-10 font-bold text-white border-r uppercase tracking-wider pl-4">Source Configuration</TableHead>
                                <TableHead className="w-[80px] h-10"></TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {processedWebDataGroups.map((group, index) => {
                                const isDocument = group.fieldType === 'document';
                                const isComputed = group.fieldType === 'computed';
                                const rowBg = isDocument ? "bg-amber-50/30 hover:bg-amber-50/60" : isComputed ? "bg-purple-50/30 hover:bg-purple-50/60" : "hover:bg-slate-50";

                                return (
                                  <TableRow
                                    key={group.id}
                                    className={cn("h-10 border-b border-slate-100 group transition-all", rowBg)}
                                  >
                                    <TableCell className="text-center text-sm border-r border-slate-100 p-0 relative">
                                      <div className="flex items-center justify-center w-full h-full gap-2 py-2">
                                        {/* Drag Handle/Reorder Control */}
                                        {!sortConfig.key ? (
                                          <>
                                            {/* Hidden Up/Down controls on hover */}
                                            <div className="absolute left-0 top-0 bottom-0 w-[20px] bg-slate-100/70 border-r border-slate-200 flex-col items-center justify-center hidden group-hover:flex transition-opacity">
                                              <Button
                                                variant="ghost"
                                                size="icon"
                                                type="button"
                                                className="h-3 w-4 p-0 rounded-none hover:bg-slate-200"
                                                onClick={() => moveRow(index, 'up')}
                                                disabled={index === 0}
                                              >
                                                <ArrowUp className="h-2 w-2 text-slate-500" />
                                              </Button>
                                              <Button
                                                variant="ghost"
                                                size="icon"
                                                type="button"
                                                className="h-3 w-4 p-0 rounded-none hover:bg-slate-200"
                                                onClick={() => moveRow(index, 'down')}
                                                disabled={index === processedWebDataGroups.length - 1}
                                              >
                                                <ArrowDown className="h-2 w-2 text-slate-500" />
                                              </Button>
                                            </div>
                                            <div className="pl-[20px] flex items-center justify-center gap-2">
                                              {/* Main Drag Handle Icon - cursor-grab is for visual DND cue */}
                                              <div className="cursor-grab text-slate-400 hover:text-blue-600 transition-colors active:text-blue-700">
                                                <GripVertical className="h-4 w-4" />
                                              </div>
                                              <span className="text-sm text-slate-500 font-medium">{index + 1}</span>
                                            </div>
                                          </>
                                        ) : (
                                          // When sorted, only show index
                                          <span className="text-sm text-slate-500 font-medium">{index + 1}</span>
                                        )}
                                      </div>
                                    </TableCell>

                                    <TableCell className="p-3 border-r border-slate-100">
                                      <span className=" text-sm font-medium text-blue-600">{group.variableName}</span>
                                    </TableCell>

                                    <TableCell className="p-3 border-r border-slate-100">
                                      <span className="text-sm text-slate-700">{group.efnsDisplayName}</span>
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
                                      <span className="text-sm text-slate-500 italic">{group.customFieldSource || '-'}</span>
                                    </TableCell>

                                    <TableCell className="p-3 border-r border-slate-100 align-middle">
                                      {group.linkedJobQuestionId ? (
                                        <div className="flex items-center gap-2">
                                          <HelpCircle className="h-3.5 w-3.5 text-purple-600" />
                                          <span className="text-sm font-medium text-purple-700 truncate max-w-[200px]">
                                            {group.linkedJobQuestionId}
                                          </span>
                                          <Badge variant="outline" className={cn(
                                            "text-[9px] ml-auto",
                                            group.fieldType === 'document' && group.linkedKycDocuments?.length > 0
                                              ? "bg-green-50 text-green-600 border-green-200"
                                              : "bg-purple-50 text-purple-600 border-purple-200"
                                          )}>
                                            {group.fieldType === 'document' && group.linkedKycDocuments?.length > 0 ? 'Requirement' : 'Job Question'}
                                          </Badge>
                                        </div>
                                      ) : isDocument ? (
                                        <div className="flex flex-col justify-center gap-1">
                                          <div className="flex items-center gap-2 text-amber-700">
                                            <Paperclip className="h-3.5 w-3.5" />
                                            <span className="text-sm font-medium truncate">
                                              {(group.linkedKycDocuments || []).length > 0
                                                ? `${(group.linkedKycDocuments || []).length} Document Types`
                                                : "No Documents Linked"}
                                            </span>
                                          </div>
                                          {(group.linkedKycDocuments || []).length > 0 && (
                                            <div className="flex items-center gap-2 pl-5">
                                              <Badge variant="outline" className="text-[9px] bg-amber-50 text-amber-700 border-amber-200">
                                                {group.documentLogic === 'merge' ? 'Merge All' : 'Fallback (First Found)'}
                                              </Badge>
                                              {group.documentCount && (
                                                <Badge variant="outline" className="text-[9px] bg-blue-50 text-blue-700 border-blue-200">
                                                  {group.documentCount} Required
                                                </Badge>
                                              )}
                                            </div>
                                          )}
                                        </div>
                                      ) : isComputed ? (
                                        <div className="flex items-center gap-2">
                                          <FunctionSquare className="h-3.5 w-3.5 text-purple-600" />
                                          <span className="text-sm  text-purple-700 truncate max-w-[200px]">{group.computedFunction || 'No function'}</span>
                                          <Badge variant="outline" className="text-[9px] bg-purple-50 text-purple-600 ml-auto">
                                            {group.computedDocuments?.length || 0} Docs
                                          </Badge>
                                        </div>
                                      ) : group.fieldType === 'array' ? (
                                        <div className="flex items-center gap-2">
                                          <TableIcon className="h-3.5 w-3.5 text-blue-600" />
                                          <span className="text-sm text-slate-600">{group.arrayItems?.length || 0} columns mapped</span>
                                        </div>
                                      ) : (
                                        <div className="flex items-center flex-wrap gap-1.5">
                                          {(group.linkedMasterFields || []).length > 0 ? (
                                            group.linkedMasterFields.map(fieldId => {
                                              const field = masterFields.find(f => f.id === fieldId);
                                              if (!field) return null;
                                              return (
                                                <Badge key={field.id} variant="outline" className="text-[10px] bg-white text-slate-700">
                                                  {field.label}
                                                </Badge>
                                              );
                                            })
                                          ) : (
                                            <span className="text-xs text-slate-400 italic">No fields mapped</span>
                                          )}
                                        </div>
                                      )}
                                    </TableCell>

                                    <TableCell className="p-2 border-b border-slate-100 text-right">
                                      <div className="flex justify-end gap-1">
                                        <Button variant="ghost" size="icon" type="button" className="h-7 w-7" onClick={() => openEditDialog(group)}>
                                          <Pencil className="h-3.5 w-3.5 text-slate-500" />
                                        </Button>
                                        <AlertDialog open={deleteGroupDialogOpen && groupToDelete === group.id} onOpenChange={(open) => !open && setDeleteGroupDialogOpen(false)}>
                                          <AlertDialogTrigger asChild>
                                            <Button variant="ghost" size="icon" type="button" className="h-7 w-7 text-red-400 hover:text-red-600 hover:bg-red-50" onClick={() => removeGroup(group.id)}>
                                              <Trash2 className="h-3.5 w-3.5" />
                                            </Button>
                                          </AlertDialogTrigger>
                                          <AlertDialogContent>
                                            <AlertDialogHeader>
                                              <AlertDialogTitle>Delete Data Field</AlertDialogTitle>
                                              <AlertDialogDescription>
                                                Are you sure you want to delete the data field "{group.efnsDisplayName}"? This action cannot be undone.
                                              </AlertDialogDescription>
                                            </AlertDialogHeader>
                                            <AlertDialogFooter>
                                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                                              <AlertDialogAction onClick={confirmRemoveGroup} className="bg-red-600 hover:bg-red-700">
                                                Delete
                                              </AlertDialogAction>
                                            </AlertDialogFooter>
                                          </AlertDialogContent>
                                        </AlertDialog>
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
                            <p className="text-sm text-slate-400">Use the "Add Data Field" button to start mapping.</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === 'requirements' && (
                  <ScrollArea className="h-full">
                    <div className="p-8 mx-auto space-y-6">
                      {!classRequirements ? (
                        <div className="flex flex-col items-center justify-center p-12 text-slate-400 bg-white rounded-xl border border-dashed">
                          <AlertCircle className="h-10 w-10 mb-4 opacity-20" />
                          <p className="text-lg font-medium">No Class Requirements Linked</p>
                          <p className="text-sm">This automation dose not have a specific job level defined yet.</p>
                        </div>
                      ) : (
                        <div className="space-y-6">
                          <Card className="border-none shadow-sm ring-1 ring-slate-200">
                            <CardHeader className="pb-4 border-b bg-slate-50/50">
                              <CardTitle className="font-bold flex items-center gap-2">
                                <Shield className="h-6 w-6 text-green-500" /> Mandatory Documents
                              </CardTitle>
                            </CardHeader>
                            <CardContent className="p-0">
                              <Table>
                                <TableHeader>
                                  <TableRow className="bg-slate-50/50">
                                    <TableHead className="w-[300px] text-xs font-bold uppercase">Requirement</TableHead>
                                    <TableHead className="text-xs font-bold uppercase">Applies To</TableHead>
                                    <TableHead className="text-xs font-bold uppercase">Document Type</TableHead>
                                    <TableHead className="text-xs font-bold uppercase">Automation</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {(classRequirements.requirements || []).length === 0 ? (
                                    <TableRow>
                                      <TableCell colSpan={4} className="text-center py-8 text-slate-400">No specific requirements defined.</TableCell>
                                    </TableRow>
                                  ) : (
                                    classRequirements.requirements.map((req, idx) => (
                                      <TableRow key={idx}>
                                        <TableCell className="font-medium text-slate-700">{req.name}</TableCell>
                                        <TableCell>
                                          <div className="flex flex-wrap gap-1">
                                            {(req.applicantTypes || []).map(t => (
                                              <Badge key={t} variant="outline" className="text-[10px] capitalize bg-blue-50/50 border-blue-100 text-blue-700">{t}</Badge>
                                            ))}
                                          </div>
                                        </TableCell>
                                        <TableCell>
                                          <div className="flex flex-col gap-1">
                                            {(req.document_ids || []).map(id => {
                                              const doc = kycDocuments.find(d => d.id === id);
                                              return (
                                                <div key={id} className="flex items-center gap-2 text-xs text-slate-600">
                                                  <FileText className="h-3 w-3 text-amber-500" />
                                                  {doc?.display_name || doc?.name || id}
                                                </div>
                                              );
                                            })}
                                          </div>
                                        </TableCell>
                                        <TableCell>
                                          {req.web_automation?.automationId ? (
                                            <Badge className="bg-purple-100 text-purple-700 border-purple-200 hover:bg-purple-200">
                                              <Zap className="h-3 w-3 mr-1" /> Linked
                                            </Badge>
                                          ) : (
                                            <span className="text-slate-300">-</span>
                                          )}
                                        </TableCell>
                                      </TableRow>
                                    ))
                                  )}
                                </TableBody>
                              </Table>
                            </CardContent>
                          </Card>

                          {classRequirements.job_specific_questions && classRequirements.job_specific_questions.length > 0 && (
                            <Card className="border-none shadow-sm ring-1 ring-slate-200">
                              <CardHeader className="pb-4 border-b bg-slate-50/50">
                                <CardTitle className="font-bold flex items-center gap-2">
                                  <HelpCircle className="h-6 w-6 text-purple-500" /> Job Specific Questions
                                </CardTitle>
                              </CardHeader>
                              <CardContent className="p-0">
                                <Table>
                                  <TableHeader>
                                    <TableRow className="bg-slate-50/50">
                                      <TableHead className="text-xs font-bold uppercase">Question Label</TableHead>
                                      <TableHead className="text-xs font-bold uppercase w-[150px]">Type</TableHead>
                                      <TableHead className="text-xs font-bold uppercase">Options</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {classRequirements.job_specific_questions.map((q, idx) => (
                                      <TableRow key={idx}>
                                        <TableCell className="font-medium text-slate-700">{q.label}</TableCell>
                                        <TableCell>
                                          <Badge variant="secondary" className="capitalize text-[10px]">{q.type}</Badge>
                                        </TableCell>
                                        <TableCell className="text-slate-500">
                                          {q.options && q.options.length > 0 ? (
                                            <div className="flex flex-wrap gap-1">
                                              {q.options.map((opt, i) => (
                                                <Badge key={i} variant="outline" className="text-[9px] border-slate-200">{opt}</Badge>
                                              ))}
                                            </div>
                                          ) : "-"}
                                        </TableCell>
                                      </TableRow>
                                    ))}
                                  </TableBody>
                                </Table>
                              </CardContent>
                            </Card>
                          )}
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                )}
              </div>

              <DialogFooter className="px-6 py-4 bg-white border-t flex-shrink-0 z-20">
                <div className="flex justify-between w-full items-center">
                  <div>
                    {initialData && (
                      <AlertDialog open={deleteFlowDialogOpen} onOpenChange={setDeleteFlowDialogOpen}>
                        <AlertDialogTrigger asChild>
                          <Button type="button" variant="ghost" size="sm" onClick={handleDelete} disabled={isDeleting || isSaving} className="text-red-500 hover:text-red-600 hover:bg-red-50 h-9">
                            {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />} Delete Flow
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete Automation Flow</AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure you want to delete the automation flow "{form.getValues('name') || 'Untitled'}"? This action cannot be undone and will remove all associated data mappings.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={confirmDeleteFlow} disabled={isDeleting} className="bg-red-600 hover:bg-red-700">
                              {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                              Delete Flow
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
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
        jobQuestions={jobQuestions}
      />

      {/* NEW Add Data Field Dialog */}
      <AddDataFieldDialog
        open={isAddFieldOpen}
        onOpenChange={setIsAddFieldOpen}
        onAdd={handleAddData}
        onOpenBulkPaste={() => setIsBulkPasteOpen(true)}
        masterFields={masterFields}
        kycDocuments={kycDocuments}
        jobQuestions={jobQuestions}
        classRequirements={classRequirements}
      />

      {/* Bulk Paste Fields Dialog */}
      <BulkPasteFieldsDialog
        open={isBulkPasteOpen}
        onOpenChange={setIsBulkPasteOpen}
        onAdd={handleBulkAddFields}
      />
    </>
  )
}