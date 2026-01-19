"use client"

import React, { useState, useEffect, useMemo, useCallback } from "react"
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
  ChevronRight, LayoutGrid, FileText, Database, Paperclip 
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
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { cn } from "@/lib/utils"
import supabase from "@/lib/supabase/client"

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
  // Added 'document' type
  fieldType: 'text' | 'number' | 'boolean' | 'date' | 'select' | 'array' | 'object' | 'document'; 
  entityType: 'principal' | 'dependant' | 'both';
  arrayItems?: Array<{ name: string; variableName: string; type: 'text' | 'number' | 'boolean' | 'date' | 'select' }>;
  linkedMasterFields: JobField[];
  kycDocumentId?: string; // New field for document attachment
}

interface KYCDocument {
  id: string;
  display_name: string;
  document_type: string;
  max_file_size_mb: number;
  name: string;
}

// --- Helper Component: Master Field Picker ---
function MasterFieldPicker({ availableFields, onSelect }: { availableFields: JobField[]; onSelect: (field: JobField) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-6 text-[10px] bg-white border-dashed">
          <Plus className="mr-1 h-3 w-3" />Add Source
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
          kycDocumentId: g.kycDocumentId || undefined, // Restore document link
          fieldType: g.fieldType || 'text'
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

  // Helper: Used Master Fields (for disabled state)
  const allLinkedMasterFieldIds = useMemo(() => 
    new Set(webDataGroups.flatMap(g => (g.linkedMasterFields || []).map(f => f.id))), 
  [webDataGroups]);

  const availableForPicking = useMemo(() => 
    masterFields.filter(f => !allLinkedMasterFieldIds.has(f.id)), 
  [masterFields, allLinkedMasterFieldIds]);

  // Helper: Used Documents (for disabled state)
  const allLinkedDocIds = useMemo(() => 
    new Set(webDataGroups.filter(g => g.fieldType === 'document').map(g => g.kycDocumentId)), 
  [webDataGroups]);

  // --- Submission ---
  const handleSubmit = async (data: AutomationFormValues) => {
    try {
      setIsSaving(true)
      const automationId = initialData?.id || crypto.randomUUID()
      
      const automationData = {
        ...data,
        id: automationId,
        // Webdata is stored as a flat array of configured items (fields or docs)
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
        entityType: 'principal' as const, 
        linkedMasterFields: [f]
      }));
      setWebDataGroups(prev => [...prev, ...newGroups]);
      setSelectedTopLevelFieldIds(new Set());
    } else {
      const newDocs = kycDocuments.filter(d => selectedTopLevelDocIds.has(d.id)).map(d => ({
        id: crypto.randomUUID(),
        efnsDisplayName: d.display_name,
        variableName: d.name, // Usually safe to use key as var name for docs
        fieldType: 'document' as const,
        entityType: 'principal' as const,
        kycDocumentId: d.id,
        linkedMasterFields: []
      }));
      setWebDataGroups(prev => [...prev, ...newDocs]);
      setSelectedTopLevelDocIds(new Set());
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl h-[90vh] flex flex-col p-0 overflow-hidden bg-slate-50">
        <DialogHeader className="p-6 bg-white border-b">
          <DialogTitle>{initialData ? 'Edit Automation' : 'Create New Automation'}</DialogTitle>
          <DialogDescription>
            Configure the automation settings and data requirements.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="flex-1 flex flex-col min-h-0">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
              <div className="px-6 pt-4 bg-white border-b">
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
                <div className="flex-1 overflow-hidden flex flex-col p-4 space-y-4">
                  
                  {/* Selector Card */}
                  <Card className="border-slate-200 flex flex-col flex-shrink-0">
                    <CardHeader className="py-2 bg-slate-50/50 border-b">
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="flex items-center gap-2">
                          <Label className="font-bold text-[11px] text-slate-500 uppercase tracking-wider">Source Selection</Label>
                          <div className="flex bg-slate-200 rounded p-0.5">
                             <Button 
                                type="button" 
                                variant="ghost" 
                                size="sm" 
                                className={cn("h-6 text-[10px] px-2", sourceType === 'fields' && "bg-white shadow-sm")}
                                onClick={() => setSourceType('fields')}
                              >
                                Data Fields
                              </Button>
                              <Button 
                                type="button" 
                                variant="ghost" 
                                size="sm" 
                                className={cn("h-6 text-[10px] px-2", sourceType === 'documents' && "bg-white shadow-sm")}
                                onClick={() => setSourceType('documents')}
                              >
                                Documents
                              </Button>
                          </div>
                        </div>
                        <div className="relative w-full md:w-64">
                          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                          <Input value={fieldSearch} onChange={e => setFieldSearch(e.target.value)} placeholder={sourceType === 'fields' ? "Filter fields..." : "Filter documents..."} className="pl-8 h-8 text-xs bg-white" />
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="p-3 overflow-auto max-h-[140px] bg-slate-50/30">
                       <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                        {sourceType === 'fields' ? (
                          filteredMasterFields.map(f => {
                            const used = allLinkedMasterFieldIds.has(f.id);
                            return (
                              <div key={f.id} className={cn("flex items-center space-x-2 p-1.5 rounded border bg-white", used && "opacity-50 grayscale bg-slate-50")}>
                                <Checkbox id={`f-${f.id}`} checked={selectedTopLevelFieldIds.has(f.id)} onCheckedChange={c => setSelectedTopLevelFieldIds(prev => {const n = new Set(prev); c ? n.add(f.id) : n.delete(f.id); return n})} disabled={used} />
                                <label htmlFor={`f-${f.id}`} className="text-[11px] font-medium truncate flex-1 cursor-pointer">{f.label}</label>
                                {used && <Check className="h-3 w-3 text-green-600" />}
                              </div>
                            )
                          })
                        ) : (
                          filteredKycDocs.map(d => {
                            const used = allLinkedDocIds.has(d.id);
                            return (
                               <div key={d.id} className={cn("flex items-center space-x-2 p-1.5 rounded border bg-white border-dashed", used && "opacity-50 grayscale bg-slate-50")}>
                                <Checkbox id={`d-${d.id}`} checked={selectedTopLevelDocIds.has(d.id)} onCheckedChange={c => setSelectedTopLevelDocIds(prev => {const n = new Set(prev); c ? n.add(d.id) : n.delete(d.id); return n})} disabled={used} />
                                <div className="flex-1 min-w-0">
                                  <label htmlFor={`d-${d.id}`} className="text-[11px] font-medium truncate cursor-pointer block">{d.display_name}</label>
                                  <p className="text-[9px] text-muted-foreground">{d.max_file_size_mb}MB • {d.document_type}</p>
                                </div>
                                {used && <Check className="h-3 w-3 text-green-600" />}
                              </div>
                            )
                          })
                        )}
                       </div>
                    </CardContent>
                    <div className="p-2 border-t flex justify-end">
                      <Button type="button" size="sm" onClick={handleAddSelected} 
                        disabled={sourceType === 'fields' ? selectedTopLevelFieldIds.size === 0 : selectedTopLevelDocIds.size === 0} 
                        className="h-7 text-xs">
                        Add Selected {sourceType === 'fields' ? 'Fields' : 'Documents'}
                      </Button>
                    </div>
                  </Card>

                  {/* Fields List */}
                  <div className="flex-1 min-h-0 overflow-auto space-y-3 pb-4">
                    {webDataGroups.length === 0 && (
                      <div className="text-center py-10 text-slate-400 text-sm">No web data configured. Select fields or documents above to begin.</div>
                    )}
                    {webDataGroups.map((group) => {
                      const isDocument = group.fieldType === 'document';
                      return (
                        <div key={group.id} className={cn("p-4 border rounded-lg shadow-sm hover:border-blue-300 transition-all relative group", isDocument ? "bg-amber-50/30 border-amber-200" : "bg-white")}>
                          <div className="grid grid-cols-4 gap-4 mb-3">
                            <div className="space-y-1">
                              <Label className="text-[10px] font-bold flex items-center gap-1">
                                {isDocument ? <Paperclip className="h-3 w-3 text-amber-600"/> : <Database className="h-3 w-3 text-blue-600"/>}
                                Display Name
                              </Label>
                              <Input value={group.efnsDisplayName} onChange={e => updateGroup(group.id, 'efnsDisplayName', e.target.value)} className="h-8 text-xs bg-white" />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-[10px] font-bold">Variable ID</Label>
                              <Input value={group.variableName} onChange={e => updateGroup(group.id, 'variableName', e.target.value)} className="h-8 text-xs font-mono text-blue-600 bg-white" />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-[10px] font-bold">Input Type</Label>
                              <Select value={group.fieldType} onValueChange={v => updateGroup(group.id, 'fieldType', v)}>
                                <SelectTrigger className="h-8 text-xs bg-white"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="text">Text</SelectItem>
                                  <SelectItem value="number">Number</SelectItem>
                                  <SelectItem value="date">Date</SelectItem>
                                  <SelectItem value="array">Array (Component Group)</SelectItem>
                                  <SelectItem value="document">Document Attachment</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-1">
                              <Label className="text-[10px] font-bold">Entity</Label>
                              <Select value={group.entityType} onValueChange={v => updateGroup(group.id, 'entityType', v)}>
                                <SelectTrigger className="h-8 text-xs bg-white"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="both">Both</SelectItem>
                                  <SelectItem value="principal">Principal</SelectItem>
                                  <SelectItem value="dependant">Dependant</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                          
                          {/* Source Mapping Display */}
                          <div className="flex flex-wrap gap-2 pt-2 border-t items-center">
                            <span className="text-[9px] font-bold text-slate-400 uppercase">
                              {isDocument ? "Linked Attachment ID:" : "Mapped Sources:"}
                            </span>
                            
                            {isDocument ? (
                              <Badge variant="outline" className="text-[9px] h-5 py-0 px-2 gap-1 bg-amber-100 border-amber-200 text-amber-800">
                                <FileText className="h-2.5 w-2.5" /> 
                                {kycDocuments.find(d => d.id === group.kycDocumentId)?.display_name || "Unknown Doc"}
                              </Badge>
                            ) : (
                              <>
                                {(group.linkedMasterFields || []).map(f => (
                                  <Badge key={f.id} variant="secondary" className="text-[9px] h-5 py-0 px-1 gap-1">
                                    {f.label}
                                    <X className="h-2.5 w-2.5 cursor-pointer" onClick={() => unlinkMasterFieldFromGroup(group.id, f.id)} />
                                  </Badge>
                                ))}
                                <MasterFieldPicker availableFields={availableForPicking} onSelect={f => linkMasterFieldToGroup(group.id, f)} />
                              </>
                            )}
                          </div>

                          {group.fieldType === 'array' && (
                            <div className="mt-3 p-3 border rounded bg-blue-50/40 space-y-2">
                               <div className="flex justify-between items-center">
                                 <Label className="text-[10px] font-bold text-blue-700">Sub-Fields (Array Items)</Label>
                                 <Button type="button" size="sm" variant="outline" className="h-5 text-[9px]" onClick={() => addArrayItem(group.id)}>+ Add Item</Button>
                               </div>
                               {group.arrayItems?.map((ai, i) => (
                                 <div key={i} className="flex gap-2 items-end">
                                   <Input value={ai.name} onChange={e => handleArrayItemChange(group.id, i, 'name', e.target.value)} placeholder="Name" className="h-7 text-[10px] flex-1 bg-white" />
                                   <Input value={ai.variableName} onChange={e => handleArrayItemChange(group.id, i, 'variableName', e.target.value)} placeholder="ID" className="h-7 text-[10px] font-mono flex-1 bg-white" />
                                   <Button type="button" size="icon" variant="ghost" className="h-7 w-7 text-red-400" onClick={() => removeArrayItem(group.id, i)}><Trash2 className="h-3.5 w-3.5" /></Button>
                                 </div>
                               ))}
                            </div>
                          )}
                          <Button type="button" variant="ghost" size="icon" className="absolute top-1 right-1 h-6 w-6 text-slate-300 hover:text-red-500" onClick={() => removeGroup(group.id)}>
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </TabsContent>
            </Tabs>

            <DialogFooter className="p-4 bg-white border-t">
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