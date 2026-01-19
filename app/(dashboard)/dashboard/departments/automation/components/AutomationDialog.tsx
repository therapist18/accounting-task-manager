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
  ChevronRight
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
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { cn } from "@/lib/utils"
import supabase from "@/lib/supabase/client"
import { ScrollArea } from "@/components/ui/scroll-area"
import * as XLSX from 'xlsx'

// --- Interfaces for Web Data ---
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
  entityTypes: ('principal' | 'dependant' | 'company' | 'understudy' | 'reference')[];
  arrayItems?: Array<{ name: string; variableName: string; type: 'text' | 'number' | 'boolean' | 'date' | 'select' }>;
  linkedMasterFields: JobField[];
  kycDocumentId?: string;
  computedFunction?: string;
  computedDocuments?: string[];
}

interface KYCDocument {
  id: string;
  display_name: string;
  document_type: string;
  max_file_size_mb: number;
  name: string;
}

// --- Helper Component: Computed Field Config ---
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
        <Button variant="outline" size="sm" className="h-6 text-[10px] border-dashed border-purple-300 text-purple-600 bg-purple-50 hover:bg-purple-100">
          <Settings2 className="h-3 w-3 mr-1.5"/> Configure Function
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[400px] p-4" align="start">
        <div className="space-y-4">
          <div>
            <Label className="text-xs font-semibold mb-2 block">Function Name</Label>
            <Input 
              value={group.computedFunction || ''} 
              onChange={e => onUpdate({ computedFunction: e.target.value })}
              placeholder="e.g. determineImmigrationStatus()"
              className="h-8 text-xs font-mono"
            />
          </div>
          
          <div>
            <Label className="text-xs font-semibold mb-2 block">Required Documents</Label>
            <div className="border rounded-lg p-2 max-h-[200px] overflow-y-auto space-y-2">
              {kycDocuments.map(doc => (
                <div key={doc.id} className="flex items-center space-x-2">
                  <Checkbox 
                    id={`doc-${doc.id}`}
                    checked={selectedDocs.includes(doc.id)}
                    onCheckedChange={(checked) => {
                      const newDocs = checked 
                        ? [...selectedDocs, doc.id]
                        : selectedDocs.filter(id => id !== doc.id);
                      setSelectedDocs(newDocs);
                      onUpdate({ computedDocuments: newDocs });
                    }}
                  />
                  <label htmlFor={`doc-${doc.id}`} className="text-xs cursor-pointer flex-1">
                    {doc.display_name}
                  </label>
                </div>
              ))}
            </div>
            {selectedDocs.length > 0 && (
              <div className="mt-2 text-[10px] text-purple-600 font-medium">
                {selectedDocs.length} document(s) selected
              </div>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// --- Helper Component: Master Field Picker ---
function MasterFieldPicker({ availableFields, onSelect }: { availableFields: JobField[]; onSelect: (field: JobField) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="h-6 w-6 text-slate-400 hover:text-blue-600">
          <Plus className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[250px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search master fields..." />
          <CommandList>
            <CommandEmpty>No fields found.</CommandEmpty>
            <CommandGroup>
              {availableFields.map((field) => (
                <CommandItem key={field.id} onSelect={() => { onSelect(field); setOpen(false) }}>
                  {field.label}
                </CommandItem>
              ))}
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
  
  // Selection States
  const [sourceType, setSourceType] = useState<'fields' | 'documents'>('fields')
  const [fieldSearch, setFieldSearch] = useState('')
  const [selectedTopLevelFieldIds, setSelectedTopLevelFieldIds] = useState<Set<number>>(new Set())
  const [selectedTopLevelDocIds, setSelectedTopLevelDocIds] = useState<Set<string>>(new Set())

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
      setSelectedTopLevelFieldIds(new Set());
      setSelectedTopLevelDocIds(new Set());
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
          // Handle legacy entityType or new entityTypes
          entityTypes: g.entityTypes || (g.entityType === 'both' ? ['principal', 'dependant'] : [g.entityType || 'principal'])
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

  // --- Derived State for Web Data ---
  const filteredMasterFields = useMemo(() => 
    masterFields.filter(f => f.label?.toLowerCase().includes(fieldSearch.toLowerCase()) || f.field_key?.toLowerCase().includes(fieldSearch.toLowerCase())), 
  [masterFields, fieldSearch]);

  const filteredKycDocs = useMemo(() => 
    kycDocuments.filter(d => d.display_name?.toLowerCase().includes(fieldSearch.toLowerCase()) || d.name?.toLowerCase().includes(fieldSearch.toLowerCase())),
  [kycDocuments, fieldSearch]);

  const allLinkedMasterFieldIds = useMemo(() => 
    new Set(webDataGroups.flatMap(g => (g.linkedMasterFields || []).map(f => f.id))), 
  [webDataGroups]);

  const availableForPicking = useMemo(() => 
    masterFields, 
  [masterFields]);

  const allLinkedDocIds = useMemo(() => 
    new Set(webDataGroups.filter(g => g.fieldType === 'document').map(g => g.kycDocumentId)), 
  [webDataGroups]);

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
        'Computed Function': group.computedFunction || '',
        'Required Documents': group.computedDocuments?.map(id => kycDocuments.find(d => d.id === id)?.display_name || id).join(', ') || ''
      }));

      const worksheet = XLSX.utils.json_to_sheet(exportData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Web Data Config");

      // Set column widths
      worksheet['!cols'] = [
        { wch: 5 },
        { wch: 20 },
        { wch: 20 },
        { wch: 15 },
        { wch: 30 },
        { wch: 40 },
        { wch: 30 },
        { wch: 40 }
      ];

      const fileName = `${form.getValues('name') || 'automation'}_webdata_config_${new Date().toISOString().split('T')[0]}.xlsx`;
      XLSX.writeFile(workbook, fileName);

      toast({ 
        title: "Success", 
        description: "Configuration exported to Excel successfully" 
      });
    } catch (error) {
      console.error("Export error:", error);
      toast({ 
        title: "Error", 
        description: "Failed to export to Excel", 
        variant: "destructive" 
      });
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
        webdata: webDataGroups.map(g => ({
           ...g,
           masterFieldIds: g.linkedMasterFields.map(f => f.id)
        })),
        created_at: initialData?.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
      
      await onSave(automationData)
      toast({ title: "Success", description: initialData ? "Automation updated" : "Automation created" })
      onOpenChange(false)
    } catch (error) {
      console.error("Error saving automation:", error)
      toast({ title: "Error", description: "Failed to save automation.", variant: "destructive" })
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
      toast({ title: "Success", description: "Automation deleted successfully" })
      onOpenChange(false)
    } catch (error) {
      toast({ title: "Error", description: "Failed to delete automation.", variant: "destructive" })
    } finally {
      setIsDeleting(false)
    }
  }

  const handleAddSelected = () => {
    if (sourceType === 'fields') {
      const newGroups = masterFields.filter(f => selectedTopLevelFieldIds.has(f.id)).map(f => ({
        id: crypto.randomUUID(), 
        efnsDisplayName: f.label, 
        variableName: f.field_key.toLowerCase().replace(/[^a-z0-9]+(.)/g, (_, chr) => chr.toUpperCase()), 
        fieldType: 'text' as const, 
        entityTypes: ['principal'] as const, 
        linkedMasterFields: [f]
      }));
      setWebDataGroups(prev => [...prev, ...newGroups]);
      setSelectedTopLevelFieldIds(new Set());
    } else {
      const newDocs = kycDocuments.filter(d => selectedTopLevelDocIds.has(d.id)).map(d => ({
        id: crypto.randomUUID(),
        efnsDisplayName: d.display_name,
        variableName: d.name, 
        fieldType: 'document' as const,
        entityTypes: ['principal'] as const,
        kycDocumentId: d.id,
        linkedMasterFields: []
      }));
      setWebDataGroups(prev => [...prev, ...newDocs]);
      setSelectedTopLevelDocIds(new Set());
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl h-[90vh] flex flex-col p-0 overflow-hidden bg-slate-50">
        <DialogHeader className="p-6 bg-white border-b flex-shrink-0">
          <DialogTitle>{initialData ? 'Edit Automation' : 'Create New Automation'}</DialogTitle>
          <DialogDescription>
            Configure the automation settings and map data fields or documents.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="flex-1 flex flex-col min-h-0">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
              <div className="px-6 pt-4 bg-white border-b flex-shrink-0">
                <TabsList className="bg-slate-100">
                  <TabsTrigger value="general">General Settings</TabsTrigger>
                  <TabsTrigger value="webdata">Web Data ({webDataGroups.length})</TabsTrigger>
                </TabsList>
              </div>

              {/* TAB 1: GENERAL SETTINGS */}
              <TabsContent value="general" className="flex-1 overflow-y-auto p-6 space-y-6 m-0">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Name</FormLabel>
                        <FormControl><Input placeholder="Automation Name" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="category"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Category</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl><SelectTrigger><SelectValue placeholder="Category" /></SelectTrigger></FormControl>
                          <SelectContent>
                            <SelectItem value="general">General</SelectItem>
                            <SelectItem value="document_processing">Document Processing</SelectItem>
                            <SelectItem value="form_automation">Form Automation</SelectItem>
                            <SelectItem value="notification">Notification</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl><Textarea placeholder="Description..." className="min-h-[80px]" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-white rounded-lg border">
                  <FormField
                    control={form.control}
                    name="webhook_url"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Webhook URL</FormLabel>
                        <FormControl><Input placeholder="https://..." {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="webhook_method"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Method</FormLabel>
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
                </div>

                <div className="p-4 bg-slate-100 rounded-lg space-y-4">
                  <h4 className="text-sm font-semibold text-slate-700">Login Credentials (Optional)</h4>
                  <FormField
                    control={form.control}
                    name="login.url"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Target URL</FormLabel>
                        <FormControl><Input placeholder="https://portal.example.com" {...field} /></FormControl>
                      </FormItem>
                    )}
                  />
                  <div className="grid grid-cols-2 gap-4">
                    <FormField control={form.control} name="login.email" render={({ field }) => (
                      <FormItem><FormLabel>Email</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>
                    )} />
                    <FormField control={form.control} name="login.password" render={({ field }) => (
                      <FormItem><FormLabel>Password</FormLabel><FormControl><Input type="password" {...field} /></FormControl></FormItem>
                    )} />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <FormField control={form.control} name="max_concurrent_runs" render={({ field }) => (
                    <FormItem><FormLabel>Max Runs</FormLabel><FormControl><Input type="number" {...field} onChange={e => field.onChange(Number(e.target.value))} /></FormControl></FormItem>
                  )} />
                  <FormField control={form.control} name="is_active" render={({ field }) => (
                    <FormItem className="flex flex-col justify-end pb-2">
                       <div className="flex items-center gap-2">
                         <Switch checked={field.value} onCheckedChange={field.onChange} />
                         <span className="text-sm font-medium">Active</span>
                       </div>
                    </FormItem>
                  )} />
                </div>
              </TabsContent>

              {/* TAB 2: WEB DATA CONFIGURATION */}
              <TabsContent value="webdata" className="flex-1 flex flex-col min-h-0 m-0 bg-slate-50/50">
                {/* 1. Selector Section */}
                <div className="p-4 bg-white border-b space-y-4 flex-shrink-0">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                       <div className="bg-slate-100 p-1 rounded-lg flex text-xs font-medium">
                          <button
                            type="button"
                            onClick={() => setSourceType('fields')}
                            className={cn("px-3 py-1.5 rounded-md transition-all", sourceType === 'fields' ? "bg-white shadow text-slate-900" : "text-slate-500 hover:text-slate-900")}
                          >
                            Data Fields
                          </button>
                          <button
                            type="button"
                            onClick={() => setSourceType('documents')}
                            className={cn("px-3 py-1.5 rounded-md transition-all", sourceType === 'documents' ? "bg-white shadow text-slate-900" : "text-slate-500 hover:text-slate-900")}
                          >
                            Documents
                          </button>
                       </div>
                       <Badge variant="outline" className="text-slate-400 font-normal">
                         {sourceType === 'fields' ? `${filteredMasterFields.length} Available` : `${filteredKycDocs.length} Available`}
                       </Badge>
                    </div>

                    <div className="relative w-full md:w-72">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                      <Input value={fieldSearch} onChange={e => setFieldSearch(e.target.value)} placeholder={`Search ${sourceType}...`} className="pl-9 h-9 text-xs" />
                    </div>
                  </div>

                  <Card className="border shadow-none">
                    <CardContent className="p-0 overflow-hidden">
                       <ScrollArea className="h-[120px] bg-slate-50/50">
                         <div className="p-3 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-2">
                           {sourceType === 'fields' ? (
                              filteredMasterFields.map(f => {
                                const used = allLinkedMasterFieldIds.has(f.id);
                                return (
                                  <div key={f.id} className="flex items-center space-x-2 p-1.5 rounded border bg-white text-[11px]">
                                    <Checkbox id={`f-${f.id}`} checked={selectedTopLevelFieldIds.has(f.id)} onCheckedChange={c => setSelectedTopLevelFieldIds(prev => {const n = new Set(prev); c ? n.add(f.id) : n.delete(f.id); return n})} />
                                    <label htmlFor={`f-${f.id}`} className="truncate flex-1 cursor-pointer">{f.label}</label>
                                  </div>
                                )
                              })
                           ) : (
                              filteredKycDocs.map(d => {
                                const used = allLinkedDocIds.has(d.id);
                                return (
                                   <div key={d.id} className="flex items-center space-x-2 p-1.5 rounded border bg-white border-dashed text-[11px]">
                                    <Checkbox id={`d-${d.id}`} checked={selectedTopLevelDocIds.has(d.id)} onCheckedChange={c => setSelectedTopLevelDocIds(prev => {const n = new Set(prev); c ? n.add(d.id) : n.delete(d.id); return n})} />
                                    <label htmlFor={`d-${d.id}`} className="truncate flex-1 cursor-pointer">{d.display_name}</label>
                                  </div>
                                )
                              })
                           )}
                           {sourceType === 'fields' && filteredMasterFields.length === 0 && <div className="col-span-full text-center py-4 text-xs text-slate-400">No matching fields found.</div>}
                           {sourceType === 'documents' && filteredKycDocs.length === 0 && <div className="col-span-full text-center py-4 text-xs text-slate-400">No matching documents found.</div>}
                         </div>
                       </ScrollArea>
                       <div className="p-2 border-t bg-white flex justify-end">
                          <Button type="button" size="sm" onClick={handleAddSelected} 
                            disabled={sourceType === 'fields' ? selectedTopLevelFieldIds.size === 0 : selectedTopLevelDocIds.size === 0} 
                            className="h-7 text-xs font-medium">
                            <Plus className="h-3 w-3 mr-1"/> Add Selected {sourceType === 'fields' ? 'Fields' : 'Documents'}
                          </Button>
                       </div>
                    </CardContent>
                  </Card>
                </div>

                {/* 2. Configuration Table - Excel-like */}
                <div className="flex-1 overflow-auto p-4">
                  {webDataGroups.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-slate-400 space-y-3">
                       <div className="h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center"><Database className="h-6 w-6 text-slate-300"/></div>
                       <p className="text-sm font-medium">No configurations added yet</p>
                       <p className="text-xs">Use the selector above to add fields or documents.</p>
                    </div>
                  ) : (
                    <div className="border rounded-lg bg-white shadow-sm overflow-hidden">
                      {/* Export Button */}
                      <div className="p-3 bg-gradient-to-r from-blue-50 to-blue-100 border-b flex justify-between items-center">
                        <h3 className="text-sm font-semibold text-blue-900">
                          Configuration Table ({webDataGroups.length} items)
                        </h3>
                        <Button 
                          type="button" 
                          size="sm" 
                          variant="outline"
                          onClick={handleExportToExcel}
                          className="h-8 text-xs bg-white hover:bg-blue-50 border-blue-200"
                        >
                          <FileSpreadsheet className="h-3.5 w-3.5 mr-1.5" />
                          Export to Excel
                        </Button>
                      </div>

                      <div className="overflow-x-auto max-h-[calc(90vh-400px)]">
                        <Table>
                          <TableHeader className="sticky top-0 z-10">
                            <TableRow className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-600 hover:to-blue-700 border-b-2 border-blue-800">
                              <TableHead className="w-[40px] text-white font-semibold text-center sticky top-0 bg-blue-600">#</TableHead>
                              <TableHead className="w-[40px] text-white font-semibold sticky top-0 bg-blue-600"></TableHead>
                              <TableHead className="w-[180px] text-white font-semibold sticky top-0 bg-blue-700">Variable ID</TableHead>
                              <TableHead className="w-[180px] text-white font-semibold sticky top-0 bg-blue-700">Display Name</TableHead>
                              <TableHead className="w-[140px] text-white font-semibold sticky top-0 bg-blue-700">Type</TableHead>
                              <TableHead className="w-[180px] text-white font-semibold sticky top-0 bg-blue-700">Entity (Multi-select)</TableHead>
                              <TableHead className="text-white font-semibold sticky top-0 bg-blue-700">Source Mapping</TableHead>
                              <TableHead className="w-[50px] text-white font-semibold sticky top-0 bg-blue-700"></TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {webDataGroups.map((group, index) => {
                               const isDocument = group.fieldType === 'document';
                               const isArray = group.fieldType === 'array';
                               const isComputed = group.fieldType === 'computed';

                               return (
                                 <TableRow 
                                   key={group.id} 
                                   className={cn(
                                     "hover:bg-blue-50/50 border-b border-slate-200",
                                     isDocument && "bg-amber-50/40 hover:bg-amber-50/60",
                                     isComputed && "bg-purple-50/40 hover:bg-purple-50/60",
                                     index % 2 === 0 && !isDocument && !isComputed && "bg-slate-50/30"
                                   )}
                                 >
                                    <TableCell className="text-center text-slate-600 text-xs font-medium border-r border-slate-200">
                                      {index + 1}
                                    </TableCell>
                                    <TableCell className="text-center text-slate-400 text-[10px] border-r border-slate-200">
                                      <GripVertical className="h-3 w-3 mx-auto"/>
                                    </TableCell>
                                    <TableCell className="border-r border-slate-200">
                                      <Input 
                                        value={group.variableName} 
                                        onChange={e => updateGroup(group.id, 'variableName', e.target.value)} 
                                        className="h-8 text-xs font-mono text-blue-600 bg-white border-slate-300 focus:border-blue-500" 
                                        placeholder="e.g. firstName"
                                      />
                                    </TableCell>
                                    <TableCell className="border-r border-slate-200">
                                      <Input 
                                        value={group.efnsDisplayName} 
                                        onChange={e => updateGroup(group.id, 'efnsDisplayName', e.target.value)} 
                                        className="h-8 text-xs bg-white border-slate-300 focus:border-blue-500" 
                                        placeholder="Label"
                                      />
                                    </TableCell>
                                    <TableCell className="border-r border-slate-200">
                                       <Select value={group.fieldType} onValueChange={v => updateGroup(group.id, 'fieldType', v)}>
                                          <SelectTrigger className="h-8 text-xs bg-white border-slate-300 focus:border-blue-500">
                                            <SelectValue />
                                          </SelectTrigger>
                                          <SelectContent>
                                            <SelectItem value="text">Text</SelectItem>
                                            <SelectItem value="number">Number</SelectItem>
                                            <SelectItem value="date">Date</SelectItem>
                                            <SelectItem value="array">Array Group</SelectItem>
                                            <SelectItem value="document">Document</SelectItem>
                                            <SelectItem value="computed">Computed Field</SelectItem>
                                          </SelectContent>
                                       </Select>
                                    </TableCell>
                                    <TableCell className="border-r border-slate-200">
                                       <Popover>
                                          <PopoverTrigger asChild>
                                             <Button variant="outline" className="h-8 w-full justify-between text-xs">
                                                <span className="truncate">
                                                   {group.entityTypes?.length > 0 
                                                      ? `${group.entityTypes.length} selected`
                                                      : 'Select entities'}
                                                </span>
                                                <ChevronRight className="h-3 w-3 ml-2" />
                                             </Button>
                                          </PopoverTrigger>
                                          <PopoverContent className="w-[200px] p-2" align="start">
                                             <div className="space-y-1">
                                                {['principal', 'dependant', 'company', 'understudy', 'reference'].map(entity => (
                                                   <div key={entity} className="flex items-center space-x-2 p-1.5 hover:bg-slate-50 rounded">
                                                      <Checkbox 
                                                         id={`${group.id}-${entity}`}
                                                         checked={group.entityTypes?.includes(entity as any)}
                                                         onCheckedChange={(checked) => {
                                                            const current = group.entityTypes || [];
                                                            const updated = checked
                                                               ? [...current, entity]
                                                               : current.filter(e => e !== entity);
                                                            updateGroup(group.id, 'entityTypes', updated);
                                                         }}
                                                      />
                                                      <label htmlFor={`${group.id}-${entity}`} className="text-xs capitalize cursor-pointer flex-1">
                                                         {entity}
                                                      </label>
                                                   </div>
                                                ))}
                                             </div>
                                          </PopoverContent>
                                       </Popover>
                                       {group.entityTypes && group.entityTypes.length > 0 && (
                                          <div className="flex gap-1 flex-wrap mt-1">
                                             {group.entityTypes.map(entity => (
                                                <Badge key={entity} variant="secondary" className="text-[9px] h-5 px-1.5 capitalize">
                                                   {entity}
                                                </Badge>
                                             ))}
                                          </div>
                                       )}
                                    </TableCell>
                                    <TableCell className="border-r border-slate-200">
                                       <div className="flex items-center gap-1 flex-wrap">
                                          {isDocument ? (
                                             <Badge variant="outline" className="text-[10px] h-6 px-2 gap-1.5 bg-amber-100 border-amber-200 text-amber-800 font-normal">
                                                <Paperclip className="h-3 w-3" /> 
                                                {kycDocuments.find(d => d.id === group.kycDocumentId)?.display_name || "Unknown Doc"}
                                             </Badge>
                                          ) : isComputed ? (
                                             <div className="space-y-1 w-full">
                                                <ComputedFieldConfig 
                                                   group={group} 
                                                   kycDocuments={kycDocuments}
                                                   onUpdate={(updates) => {
                                                      Object.entries(updates).forEach(([key, value]) => {
                                                         updateGroup(group.id, key as keyof WebDataGroup, value);
                                                      });
                                                   }}
                                                />
                                                {group.computedFunction && (
                                                   <div className="text-[9px] font-mono text-purple-600 bg-purple-50 px-2 py-1 rounded border border-purple-200">
                                                      {group.computedFunction}
                                                   </div>
                                                )}
                                                {group.computedDocuments && group.computedDocuments.length > 0 && (
                                                   <div className="flex gap-1 flex-wrap">
                                                      {group.computedDocuments.map(docId => (
                                                         <Badge key={docId} variant="outline" className="text-[9px] h-5 px-1.5 bg-purple-50 border-purple-200">
                                                            {kycDocuments.find(d => d.id === docId)?.display_name || docId}
                                                         </Badge>
                                                      ))}
                                                   </div>
                                                )}
                                             </div>
                                          ) : isArray ? (
                                             <Popover>
                                                <PopoverTrigger asChild>
                                                   <Button variant="outline" size="sm" className="h-6 text-[10px] border-dashed border-blue-300 text-blue-600 bg-blue-50 hover:bg-blue-100">
                                                      <Settings2 className="h-3 w-3 mr-1.5"/> Configure {group.arrayItems?.length || 0} Items
                                                   </Button>
                                                </PopoverTrigger>
                                                <PopoverContent className="w-[340px] p-3" align="start">
                                                   <div className="space-y-3">
                                                      <div className="flex items-center justify-between pb-2 border-b">
                                                         <h4 className="font-semibold text-xs">Array Sub-Fields</h4>
                                                         <Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={() => addArrayItem(group.id)}><Plus className="h-3 w-3 mr-1"/> Add Item</Button>
                                                      </div>
                                                      <div className="space-y-2 max-h-[200px] overflow-y-auto">
                                                         {group.arrayItems?.map((ai, i) => (
                                                            <div key={i} className="flex gap-2 items-center">
                                                               <Input value={ai.name} onChange={e => handleArrayItemChange(group.id, i, 'name', e.target.value)} placeholder="Name" className="h-7 text-[10px] flex-1" />
                                                               <Input value={ai.variableName} onChange={e => handleArrayItemChange(group.id, i, 'variableName', e.target.value)} placeholder="Var ID" className="h-7 text-[10px] font-mono flex-1" />
                                                               <Button size="icon" variant="ghost" className="h-7 w-7 text-red-400 hover:text-red-600" onClick={() => removeArrayItem(group.id, i)}><Trash2 className="h-3 w-3" /></Button>
                                                            </div>
                                                         ))}
                                                         {(!group.arrayItems || group.arrayItems.length === 0) && <p className="text-[10px] text-slate-400 text-center py-2">No sub-fields added.</p>}
                                                      </div>
                                                   </div>
                                                </PopoverContent>
                                             </Popover>
                                          ) : (
                                             <>
                                                {(group.linkedMasterFields || []).map(f => (
                                                  <Badge key={f.id} variant="secondary" className="text-[10px] h-6 px-1.5 gap-1 font-normal bg-slate-100 hover:bg-slate-200">
                                                    {f.label}
                                                    <X className="h-3 w-3 cursor-pointer text-slate-400 hover:text-red-500" onClick={() => unlinkMasterFieldFromGroup(group.id, f.id)} />
                                                  </Badge>
                                                ))}
                                                <MasterFieldPicker availableFields={availableForPicking} onSelect={f => linkMasterFieldToGroup(group.id, f)} />
                                             </>
                                          )}
                                       </div>
                                    </TableCell>
                                    <TableCell className="text-center">
                                      <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-300 hover:text-red-500 hover:bg-red-50" onClick={() => removeGroup(group.id)}>
                                        <Trash2 className="h-4 w-4" />
                                      </Button>
                                    </TableCell>
                                 </TableRow>
                               )
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  )}
                </div>
              </TabsContent>
            </Tabs>

            <DialogFooter className="p-4 bg-white border-t flex-shrink-0">
              <div className="flex justify-between w-full items-center">
                <div>
                  {initialData && (
                    <Button type="button" variant="destructive" size="sm" onClick={handleDelete} disabled={isDeleting || isSaving}>
                      {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />} Delete
                    </Button>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving || isDeleting}>Cancel</Button>
                  <Button type="submit" disabled={isSaving || isDeleting}>
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
  )
}