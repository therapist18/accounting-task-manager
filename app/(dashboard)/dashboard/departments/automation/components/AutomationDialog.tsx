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
  Type
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
}

interface WebDataGroup {
  id: string;
  efnsDisplayName: string;
  variableName: string;
  fieldType: 'text' | 'number' | 'boolean' | 'date' | 'select' | 'array' | 'object' | 'document' | 'computed'; 
  entityTypes: string[]; 
  // New fields to match Template Manager logic
  dependantRelationships?: string[];
  directorType?: 'all' | 'primary';
  arrayItems?: Array<{ name: string; variableName: string; type: 'text' | 'number' | 'boolean' | 'date' | 'select' }>;
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
// --- Helper: Entity Configuration ---
function EntityConfigurator({ 
  group, 
  onUpdate 
}: { 
  group: WebDataGroup; 
  onUpdate: (updates: Partial<WebDataGroup>) => void; 
}) {
  const [open, setOpen] = useState(false);

  // Helper to toggle entity types
  const toggleEntityType = (type: string) => {
    const current = group.entityTypes || [];
    const exists = current.includes(type);
    let newTypes = exists 
      ? current.filter(t => t !== type)
      : [...current, type];
    
    // Clean up dependent relationships if dependent is removed
    let newRelationships = group.dependantRelationships;
    if (type === 'dependent' && exists) {
      newRelationships = [];
    }
    
    // Clean up director type if director is removed
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
        <button type="button" className="w-full h-full text-left px-4 flex flex-col justify-center text-xs hover:bg-black/5 transition-colors group/btn">
          <div className="flex items-center justify-between w-full">
            <span className={cn("truncate font-medium", group.entityTypes?.length ? "text-slate-700" : "text-slate-400 italic")}>
              {group.entityTypes?.length > 0 
                ? `${group.entityTypes.length} Selected`
                : "Select entities..."}
            </span>
            <ChevronRight className="h-3 w-3 text-slate-300 group-hover/btn:text-slate-500" />
          </div>
          {/* Summary sub-text */}
          {group.entityTypes?.includes('dependent') && (
            <div className="text-[9px] text-slate-400 truncate">
               {(group.dependantRelationships?.length || 0) > 0 
                 ? `${group.dependantRelationships?.length} rels` 
                 : 'All relations'}
            </div>
          )}
        </button>
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

                    {/* Conditional Logic: Dependent Relationships */}
                    {isSelected && type.value === 'dependent' && (
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

                    {/* Conditional Logic: Director Type */}
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

  return (
    <Popover>
      <PopoverTrigger asChild>
        <div className="w-full h-full flex items-center px-2 cursor-pointer hover:bg-purple-50 group transition-colors">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <Calculator className="h-3.5 w-3.5 text-purple-600 flex-shrink-0" />
              <span className={cn("text-xs font-mono font-medium truncate", group.computedFunction ? "text-purple-700" : "text-slate-400 italic")}>
                {group.computedFunction || "Configure function..."}
              </span>
            </div>
            {group.computedDocuments && group.computedDocuments.length > 0 && (
              <div className="text-[9px] text-slate-500 mt-0.5 truncate pl-5">
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
          {/* Function Name */}
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
          
          {/* Dependency Documents */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold text-slate-700">Required Documents</Label>
              <Badge variant="secondary" className="h-5 text-[10px] bg-purple-50 text-purple-700 border-purple-100">
                {selectedDocs.length} selected
              </Badge>
            </div>
            
            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <div className="bg-slate-50 px-3 py-2 border-b border-slate-200 flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Available Assets</span>
              </div>
              
              <ScrollArea className="h-[200px] bg-white">
                <div className="divide-y divide-slate-100">
                  {kycDocuments.length === 0 ? (
                    <div className="p-8 text-center">
                      <FileText className="h-8 w-8 text-slate-200 mx-auto mb-2" />
                      <p className="text-xs text-slate-400">No KYC documents available</p>
                    </div>
                  ) : (
                    kycDocuments.map((doc) => {
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
                            onCheckedChange={() => {}} // handled by div click
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
        <Button variant="ghost" size="sm" className="h-6 w-6 p-0 rounded-md hover:bg-blue-50 text-blue-500 transition-colors">
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

  // --- Web Data State ---
  const [webDataGroups, setWebDataGroups] = useState<WebDataGroup[]>([])
  const [masterFields, setMasterFields] = useState<JobField[]>([])
  const [kycDocuments, setKycDocuments] = useState<KYCDocument[]>([])
  
  // -- Add Data Dialog State --
  const [isAddFieldOpen, setIsAddFieldOpen] = useState(false)
  const [addDialogSearchTerm, setAddDialogSearchTerm] = useState('')
  const [fieldSearch, setFieldSearch] = useState('')

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

  // --- Data Fetching ---
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

  // --- Initialization ---
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
        // Update entityTypes mapping to ensure array
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

  // --- Web Data Handlers ---
  const updateGroup = (id: string, field: keyof WebDataGroup, value: any) => 
    setWebDataGroups(prev => prev.map(g => g.id === id ? { ...g, [field]: value } : g));
  
  const removeGroup = (id: string) => 
    setWebDataGroups(prev => prev.filter(g => g.id !== id));
  
  const linkMasterFieldToGroup = (groupId: string, field: JobField) => {
    setWebDataGroups(prev => prev.map(g => g.id === groupId ? { 
      ...g, 
      linkedMasterFields: [...(g.linkedMasterFields || []), field] 
    } : g));
  };
  
  const unlinkMasterFieldFromGroup = (groupId: string, fieldId: number) => {
    setWebDataGroups(prev => prev.map(g => g.id === groupId ? { 
      ...g, 
      linkedMasterFields: g.linkedMasterFields.filter(f => f.id !== fieldId) 
    } : g));
  };

  const handleArrayItemChange = (groupId: string, idx: number, prop: string, val: any) => {
    const group = webDataGroups.find(g => g.id === groupId);
    if (!group) return;
    const ni = [...(group.arrayItems || [])];
    // @ts-ignore
    ni[idx] = { ...ni[idx], [prop]: val };
    updateGroup(groupId, 'arrayItems', ni);
  };

  const addArrayItem = (groupId: string) => {
    const group = webDataGroups.find(g => g.id === groupId);
    if (!group) return;
    updateGroup(groupId, 'arrayItems', [...(group.arrayItems || []), { name: '', variableName: '', type: 'text' }]);
  };

  const removeArrayItem = (groupId: string, idx: number) => {
    const group = webDataGroups.find(g => g.id === groupId);
    if (!group) return;
    updateGroup(groupId, 'arrayItems', (group.arrayItems || []).filter((_, i) => i !== idx));
  };

  const availableForPicking = useMemo(() => masterFields, [masterFields]);

  // --- Export to Excel ---
  const handleExportToExcel = () => {
    try {
      const exportData = webDataGroups.map((group, index) => ({
        '#': index + 1,
        'Variable ID': group.variableName,
        'Display Name': group.efnsDisplayName,
        'Type': group.fieldType,
        'Entities': group.entityTypes?.join(', ') || 'None',
        'Source Mapping': group.fieldType === 'document' 
          ? kycDocuments.find(d => d.id === group.kycDocumentId)?.display_name || "Unknown Doc"
          : group.fieldType === 'array'
          ? `Array with ${group.arrayItems?.length || 0} items`
          : group.fieldType === 'computed'
          ? `Function: ${group.computedFunction || 'Not configured'}`
          : group.linkedMasterFields.map(f => f.label).join(', ') || 'None',
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

  // --- Submission ---
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

  // --- ADD ITEM HANDLERS ---
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

 // -- Filtering for the Add Dialog --
 const filteredAddFields = masterFields.filter(f => f.label?.toLowerCase().includes(addDialogSearchTerm.toLowerCase()));
 const filteredAddDocs = kycDocuments.filter(d => d.display_name?.toLowerCase().includes(addDialogSearchTerm.toLowerCase()));

  return (
    <>
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[85vw] h-[90vh] flex flex-col p-0 overflow-hidden bg-slate-50 border-none shadow-2xl rounded-xl">
        {/* Header */}
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
            {/* Custom Tabs Navigation */}
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

            {/* TAB CONTENT */}
            <div className="flex-1 overflow-hidden relative bg-slate-50/50">
              {/* --- TAB 1: GENERAL SETTINGS --- */}
              {activeTab === 'general' && (
                <ScrollArea className="h-full">
                    <div className="p-8 max-w-5xl mx-auto space-y-6">
                        {/* Card 1: Basic Info */}
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
                             {/* Card 2: Connection */}
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

                             {/* Card 3: Auth */}
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

              {/* --- TAB 2: DATA MAPPING --- */}
              {activeTab === 'webdata' && (
                  <div className="flex flex-col h-full">
                      {/* ACTION BAR */}
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

                      {/* DATA TABLE */}
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
                                            <TableHead className="h-10 text-[10px] font-bold text-white border-r uppercase tracking-wider pl-4">Source Configuration</TableHead>
                                            <TableHead className="w-[50px] h-10"></TableHead>
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
                                                    
                                                    {/* Variable Name */}
                                                    <TableCell className="p-0 border-r border-slate-100 relative">
                                                        <Input 
                                                            value={group.variableName} 
                                                            onChange={e => updateGroup(group.id, 'variableName', e.target.value)} 
                                                            className="h-10 w-full rounded-none border-none shadow-none focus-visible:ring-0 focus-visible:bg-white text-xs font-mono font-medium text-blue-600 bg-transparent px-4" 
                                                            placeholder="key_name"
                                                        />
                                                    </TableCell>

                                                    {/* Display Name */}
                                                    <TableCell className="p-0 border-r border-slate-100">
                                                        <Input 
                                                            value={group.efnsDisplayName} 
                                                            onChange={e => updateGroup(group.id, 'efnsDisplayName', e.target.value)} 
                                                            className="h-10 w-full rounded-none border-none shadow-none focus-visible:ring-0 focus-visible:bg-white text-xs text-slate-700 bg-transparent px-4" 
                                                            placeholder="Label"
                                                        />
                                                    </TableCell>

                                                    {/* Type */}
                                                    <TableCell className="p-0 border-r border-slate-100">
                                                        <Select value={group.fieldType} onValueChange={v => updateGroup(group.id, 'fieldType', v)}>
                                                            <SelectTrigger className="h-10 w-full rounded-none border-none shadow-none focus:ring-0 text-xs px-4 bg-transparent font-medium text-slate-600">
                                                                <SelectValue />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                <SelectItem value="text">Text</SelectItem>
                                                                <SelectItem value="number">Number</SelectItem>
                                                                <SelectItem value="date">Date</SelectItem>
                                                                <SelectItem value="array">Array</SelectItem>
                                                                <SelectItem value="document">Document</SelectItem>
                                                                <SelectItem value="computed">Computed</SelectItem>
                                                            </SelectContent>
                                                        </Select>
                                                    </TableCell>

                                                    {/* Entities */}
                                                  <TableCell className="p-0 border-r border-slate-100 align-top">
  <EntityConfigurator 
    group={group} 
    onUpdate={(updates) => Object.entries(updates).forEach(([key, value]) => updateGroup(group.id, key as keyof WebDataGroup, value))}
  />
</TableCell>

                                                    {/* Source Config */}
                                                    <TableCell className="p-0 border-r border-slate-100 align-middle">
                                                        {isDocument ? (
                                                            <div className="flex items-center px-4 gap-2 h-full text-amber-700 bg-amber-50/50">
                                                                <Paperclip className="h-3.5 w-3.5" />
                                                                <span className="text-xs font-medium truncate">
                                                                    {kycDocuments.find(d => d.id === group.kycDocumentId)?.display_name || "Unknown Document"}
                                                                </span>
                                                            </div>
                                                        ) : isComputed ? (
                                                            <ComputedFieldConfig 
                                                                group={group} 
                                                                kycDocuments={kycDocuments}
                                                                onUpdate={(updates) => Object.entries(updates).forEach(([key, value]) => updateGroup(group.id, key as keyof WebDataGroup, value))}
                                                            />
                                                        ) : group.fieldType === 'array' ? (
                                                           <div className="flex items-center px-4 h-full">
                                                              <Popover>
                                                                  <PopoverTrigger asChild>
                                                                    <Button variant="ghost" size="sm" className="h-7 text-xs border border-dashed border-slate-300 text-slate-500 hover:text-blue-600 hover:border-blue-300">
                                                                        <TableIcon className="h-3 w-3 mr-1.5"/> {group.arrayItems?.length || 0} Sub-fields
                                                                    </Button>
                                                                  </PopoverTrigger>
                                                                  <PopoverContent className="w-[300px] p-0" align="start">
                                                                     <div className="bg-slate-50 p-2 border-b flex justify-between items-center">
                                                                        <span className="text-xs font-bold text-slate-700">Array Columns</span>
                                                                        <Button size="sm" variant="ghost" className="h-5 text-[10px]" onClick={() => addArrayItem(group.id)}><Plus className="h-3 w-3 mr-1"/> Add</Button>
                                                                     </div>
                                                                     <div className="p-2 space-y-2 max-h-[200px] overflow-y-auto">
                                                                        {group.arrayItems?.map((ai, i) => (
                                                                           <div key={i} className="flex gap-1 items-center">
                                                                              <Input value={ai.name} onChange={e => handleArrayItemChange(group.id, i, 'name', e.target.value)} placeholder="Name" className="h-7 text-[10px]" />
                                                                              <Input value={ai.variableName} onChange={e => handleArrayItemChange(group.id, i, 'variableName', e.target.value)} placeholder="Key" className="h-7 text-[10px] font-mono" />
                                                                              <Button size="icon" variant="ghost" className="h-7 w-7 text-red-400" onClick={() => removeArrayItem(group.id, i)}><X className="h-3 w-3" /></Button>
                                                                           </div>
                                                                        ))}
                                                                     </div>
                                                                  </PopoverContent>
                                                              </Popover>
                                                           </div>
                                                        ) : (
                                                            <div className="flex items-center gap-1.5 flex-wrap px-4 h-full py-1">
                                                                {(group.linkedMasterFields || []).map(f => (
                                                                    <Badge key={f.id} variant="secondary" className="text-[10px] h-6 px-2 font-normal bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-blue-300 transition-colors shadow-sm">
                                                                        {f.label}
                                                                        <X className="h-3 w-3 ml-1.5 cursor-pointer text-slate-300 hover:text-red-500" onClick={() => unlinkMasterFieldFromGroup(group.id, f.id)} />
                                                                    </Badge>
                                                                ))}
                                                                <MasterFieldPicker availableFields={availableForPicking} onSelect={f => linkMasterFieldToGroup(group.id, f)} />
                                                            </div>
                                                        )}
                                                    </TableCell>

                                                    {/* Delete Action */}
                                                    <TableCell className="p-0 border-b border-slate-100">
                                                        <button 
                                                            type="button"
                                                            className="w-full h-full flex items-center justify-center text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                                                            onClick={() => removeGroup(group.id)}
                                                        >
                                                            <Trash2 className="h-3.5 w-3.5" />
                                                        </button>
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

    {/* ADD FIELD DIALOG */}
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
    
    {/* 1. Special / Manual Inputs */}
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

    {/* 2. Database Fields */}
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

    {/* 3. Documents */}
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