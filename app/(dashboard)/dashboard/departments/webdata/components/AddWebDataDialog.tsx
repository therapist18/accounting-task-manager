//@ts-nocheck
"use client"
import React, { useEffect, useState, useMemo, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import supabase from "@/lib/supabase/client"
import { toast } from "@/hooks/use-toast"
import {
  Check, Link2, Merge, Plus, X, FileText, Upload, User, Users,
  AlertTriangle, Zap, Search, Loader2, ChevronRight, LayoutGrid, Webhook,
  Info,
  Trash2
} from "lucide-react"
import { cn } from "@/lib/utils"

// Enhanced interfaces
interface KYCDocument {
  id: string;
  display_name: string;
  document_type: string;
  entity_type: 'principal' | 'dependant' | 'both';
  is_required: boolean;
  file_extensions: string[];
  max_file_size_mb: number;
  description?: string;
}

interface WebDataForm {
  name: string;
  description: string;
  isRequired: boolean;
  masterFieldIds: string[];
  masterFields: JobField[];
  order: number;
  variableName: string;
  efnsDisplayName: string;
  fieldType: 'text' | 'number' | 'boolean' | 'date' | 'select' | 'array' | 'object';
  formName?: string;
  formId?: string;
  entityType?: 'principal' | 'dependant' | 'both';
  kycDocumentId?: string;
  arrayItems?: Array<{ name: string; variableName: string; type: 'text' | 'number' | 'boolean' | 'date' | 'select' }>
}

interface FormDocument {
  id: string;
  name: string;
  docType: string;
  kycId: string;
  isRequired: boolean;
  isSpecial: boolean;
  documentType: string;
  automationLinks?: Record<string, string>; // Map of entity keys to automation IDs
  targetEntities: Array<{
    class_id?: number;
    subclass_id?: number;
    entityName: string;
    entityType: string;
    subdept_id?: number;
  }>;
}

interface JobField {
  id: number;
  field_key: string;
  label: string;
  type: 'text' | 'date' | 'number' | 'select';
  is_required: boolean;
  sources?: Array<{
    source_type: 'profile' | 'document' | 'company';
    table: string;
    path: string;
    priority: number
  }>;
  options?: string[];
  created_at: string;
  updated_at: string;
}

interface WebDataGroup {
  id: string;
  efnsDisplayName: string;
  variableName: string;
  fieldType: WebDataForm['fieldType'];
  entityType: 'principal' | 'dependant' | 'both';
  kycDocumentId?: string;
  arrayItems?: WebDataForm['arrayItems'];
  linkedMasterFields: JobField[];
}

interface AddWebDataDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  context: {
    type: 'subdepartment' | 'class' | 'subclass';
    subdepartmentId: number;
    subdepartmentName: string;
    classId?: number;
    className?: string;
    subclassId?: number;
    subclassName?: string;
    availableForms?: Array<{ id: string; name: string }>;
  } | null;
  onSubmit: (data: any) => void;
  isSubmitting: boolean;
}
function MasterFieldPicker({ availableFields, onSelect }: { availableFields: JobField[]; onSelect: (field: JobField) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="xs" className="h-7 text-[10px] bg-white">
          <Plus className="mr-1 h-3.5 w-3.5" />Add Source
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

export function AddWebDataDialog({ isOpen, onOpenChange, context, onSubmit, isSubmitting: parentSubmitting }: AddWebDataDialogProps) {
  const [activeTab, setActiveTab] = useState<'fields' | 'documents'>('fields')
  const [webDataGroups, setWebDataGroups] = useState<WebDataGroup[]>([])
  const [masterFields, setMasterFields] = useState<JobField[]>([])
  const [formDocuments, setFormDocuments] = useState<FormDocument[]>([])
  const [kycDocuments, setKycDocuments] = useState<KYCDocument[]>([])
  const [selectedKycDocuments, setSelectedKycDocuments] = useState<Map<string, 'principal' | 'dependant' | 'both'>>(new Map())
  const [loadingMasterFields, setLoadingMasterFields] = useState(false)
  const [loadingForms, setLoadingForms] = useState(false)
  const [loadingKyc, setLoadingKyc] = useState(false)
  const [fieldSearch, setFieldSearch] = useState('')
  const [kycSearch, setKycSearch] = useState('')
  const [selectedTopLevelFieldIds, setSelectedTopLevelFieldIds] = useState<Set<number>>(new Set())
  const [selectedGroupIdsForMerge, setSelectedGroupIdsForMerge] = useState<Set<string>>(new Set())
  const [selectedFormId, setSelectedFormId] = useState<string>('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // 1. DATA LOOKUP HELPERS
  const getAutomationIdFromForm = useCallback((form: FormDocument | null): string | null => {
    if (!form || !form.targetEntities || !Array.isArray(form.targetEntities)) return null;
    const match = form.targetEntities.find(target => {
      const jl = target.job_level;
      if (!jl) return false;
      const subMatch = Number(jl.subdepartment_id) === Number(context?.subdepartmentId);
      const classMatch = String(jl.class_id || 'null') === String(context?.classId || 'null');
      const subclassMatch = String(jl.subclass_id || 'null') === String(context?.subclassId || 'null');
      return subMatch && classMatch && subclassMatch;
    });
    return match?.automationId || null;
  }, [context]);

  const fetchFormDocuments = useCallback(async () => {
    setLoadingForms(true)
    try {
      const { data: departments } = await supabase.from('tm_departments').select('stages')
      const allDocs = (departments || []).flatMap(d => (d.stages || []).flatMap(s => s.documents || []));
      const forms = allDocs.filter(doc => doc.docType === 'form').map(doc => ({
        id: doc.id, name: doc.name, docType: doc.docType, kycId: doc.kycId,
        isRequired: !!doc.isRequired, isSpecial: !!doc.isSpecial,
        targetEntities: Array.isArray(doc.targetEntities) ? doc.targetEntities : []
      }));
      const uniqueForms = Array.from(new Map(forms.map(f => [`${f.name}-${f.kycId}`, f])).values());
      setFormDocuments(uniqueForms)
    } finally { setLoadingForms(false) }
  }, []);

  const fetchMasterFields = useCallback(async () => {
    setLoadingMasterFields(true);
    const { data } = await supabase.from('tm_job_fields').select('*').order('label');
    setMasterFields(data || []);
    setLoadingMasterFields(false);
  }, []);

  const fetchKycDocuments = useCallback(async () => {
    setLoadingKyc(true);
    const { data } = await supabase.from('acc_portal_kyc').select('*').order('display_name');
    setKycDocuments(data || []);
    setLoadingKyc(false);
  }, []);

  // 2. FETCH AND POPULATE LOGIC
  useEffect(() => {
    if (isOpen) {
      fetchMasterFields(); fetchFormDocuments(); fetchKycDocuments();
      setSelectedFormId(''); setWebDataGroups([]); setSelectedKycDocuments(new Map());
    }
  }, [isOpen]);

  useEffect(() => {
    const fetchAndPopulateData = async () => {
      if (!selectedFormId || selectedFormId === 'none' || masterFields.length === 0) return;
      console.log("🔍 [WebDataPopulate] Fetching existing data for Form:", selectedFormId);
      try {
        let query = supabase.from('tm_class_requirements').select('webData')
          .eq('job_level->>department_id', String(context.departmentId))
          .eq('job_level->>subdepartment_id', String(context.subdepartmentId));
        if (context.classId) query = query.eq('job_level->>class_id', String(context.classId));
        else query = query.is('job_level->>class_id', null);
        if (context.subclassId) query = query.eq('job_level->>subclass_id', String(context.subclassId));
        else query = query.is('job_level->>subclass_id', null);

        const { data } = await query.maybeSingle();
        if (data?.webData) {
          const entry = data.webData.find(e => e.documentId === selectedFormId);
          if (entry) {
            setWebDataGroups((entry.fields || []).map(f => ({
              id: crypto.randomUUID(),
              efnsDisplayName: f.efnsDisplayName || f.name,
              variableName: f.variableName,
              fieldType: f.fieldType || 'text',
              entityType: f.entityType || 'both',
              arrayItems: f.arrayItems || [],
              linkedMasterFields: masterFields.filter(mf => f.masterFieldIds?.includes(String(mf.id)))
            })));
            const kycMap = new Map();
            entry.kycDocsUpload?.forEach(k => kycMap.set(k.kycDocumentId, k.entityType || 'both'));
            setSelectedKycDocuments(kycMap);
          }
        }
      } catch (err) { console.error(err); }
    };
    fetchAndPopulateData();
  }, [selectedFormId, context, masterFields]);

  // 3. HANDLERS (Corrected Reference issues)
  const updateGroup = (id, field, value) => setWebDataGroups(prev => prev.map(g => g.id === id ? { ...g, [field]: value } : g));
  
  const removeGroup = (id) => setWebDataGroups(prev => prev.filter(g => g.id !== id));
  
  const linkMasterFieldToGroup = (groupId: string, field: JobField) => {
    setWebDataGroups(prev => prev.map(g => g.id === groupId ? { ...g, linkedMasterFields: [...g.linkedMasterFields, field] } : g));
  };
  
  const unlinkMasterFieldFromGroup = (groupId: string, fieldId: number) => {
    setWebDataGroups(prev => prev.map(g => g.id === groupId ? { ...g, linkedMasterFields: g.linkedMasterFields.filter(f => f.id !== fieldId) } : g));
  };

  const handleArrayItemChange = (groupId, idx, prop, val) => {
    const group = webDataGroups.find(g => g.id === groupId);
    const ni = [...(group.arrayItems || [])];
    ni[idx] = { ...ni[idx], [prop]: val };
    updateGroup(groupId, 'arrayItems', ni);
  };

  const addArrayItem = (groupId) => {
    const group = webDataGroups.find(g => g.id === groupId);
    updateGroup(groupId, 'arrayItems', [...(group.arrayItems || []), { name: '', variableName: '', type: 'text' }]);
  };

  const removeArrayItem = (groupId, idx) => {
    const group = webDataGroups.find(g => g.id === groupId);
    updateGroup(groupId, 'arrayItems', (group.arrayItems || []).filter((_, i) => i !== idx));
  };

  const handleSubmit = async () => {
    if (!selectedFormId) return toast({ title: "Error", description: "Select a form first" });
    setIsSubmitting(true);
    try {
      const newFormEntry = {
        automationId: automationIdForContext,
        documentId: selectedFormId,
        documentName: selectedForm?.name || "Manual Config",
        fields: webDataGroups.map((g, i) => ({ ...g, name: g.efnsDisplayName, masterFieldIds: g.linkedMasterFields.map(f => String(f.id)), order: i })),
        kycDocsUpload: Array.from(selectedKycDocuments.entries()).map(([id, type]) => ({
          kycDocumentId: id, entityType: type, isRequired: true // simplified
        }))
      };

      let query = supabase.from('tm_class_requirements').select('id, webData')
        .eq('job_level->>department_id', String(context.departmentId))
        .eq('job_level->>subdepartment_id', String(context.subdepartmentId));
      if (context.classId) query = query.eq('job_level->>class_id', String(context.classId));
      else query = query.is('job_level->>class_id', null);
      if (context.subclassId) query = query.eq('job_level->>subclass_id', String(context.subclassId));
      else query = query.is('job_level->>subclass_id', null);

      const { data: existingRecord } = await query.maybeSingle();
      const finalWebData = existingRecord ? [...(existingRecord.webData || []).filter(e => e.documentId !== selectedFormId), newFormEntry] : [newFormEntry];
      
      const { error } = await supabase.from('tm_class_requirements').upsert({
        ...(existingRecord?.id && { id: existingRecord.id }),
        job_level: { department_id: Number(context.departmentId), subdepartment_id: Number(context.subdepartmentId), class_id: context.classId || null, subclass_id: context.subclassId || null, level: context.subclassId ? 4 : context.classId ? 3 : 2 },
        webData: finalWebData,
        type: context.type,
        updated_at: new Date().toISOString()
      });

      if (error) throw error;
      toast({ title: "Success", description: "Configuration saved." });
      onSubmit(finalWebData); onOpenChange(false);
    } catch (e) { console.error(e); } finally { setIsSubmitting(false); }
  };

  const filteredMasterFields = useMemo(() => masterFields.filter(f => f.label?.toLowerCase().includes(fieldSearch.toLowerCase()) || f.field_key?.toLowerCase().includes(fieldSearch.toLowerCase())), [masterFields, fieldSearch]);
  const allLinkedMasterFieldIds = useMemo(() => new Set(webDataGroups.flatMap(g => g.linkedMasterFields.map(f => f.id))), [webDataGroups]);
 const availableForPicking = useMemo(() => masterFields.filter(f => !allLinkedMasterFieldIds.has(f.id)), [masterFields, allLinkedMasterFieldIds]);
  const applicableForms = useMemo(() => formDocuments.filter(f => !f.isSpecial || f.targetEntities?.some(t => Number(t.job_level?.subdepartment_id) === Number(context?.subdepartmentId))), [formDocuments, context]);
  const selectedForm = useMemo(() => formDocuments.find(f => f.id === selectedFormId), [selectedFormId, formDocuments]);
  const automationIdForContext = useMemo(() => getAutomationIdFromForm(selectedForm), [selectedForm, getAutomationIdFromForm]);
  const filteredKycDocuments = useMemo(() =>
    kycDocuments.filter(doc =>
      doc.display_name?.toLowerCase().includes(kycSearch.toLowerCase())
    ),
    [kycDocuments, kycSearch]
  );

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-7xl max-h-[95vh] flex flex-col p-0 overflow-hidden bg-slate-50">
        {/* HEADER AREA */}
        <div className="p-6 bg-white border-b z-10">
          <div className="flex justify-between items-start mb-6">
            <div>
              <DialogTitle className="text-2xl font-bold">WebData Configuration</DialogTitle>
              <div className="flex items-center gap-2 mt-1 text-slate-500 text-sm">
                <Badge variant="outline" className="bg-slate-50">{context?.subdepartmentName}</Badge>
                {context?.className && <><ChevronRight className="h-3 w-3"/> <span className="text-blue-600 font-medium">{context.className}</span></>}
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)}><X className="h-5 w-5"/></Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-end">
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase text-blue-600">1. Target Form</Label>
              <Select value={selectedFormId} onValueChange={setSelectedFormId}>
                <SelectTrigger className="h-11 border-slate-200 bg-white"><SelectValue placeholder="Choose an application form..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none" className="italic text-amber-600">Manual Entry (No Automation)</SelectItem>
                  {applicableForms.map(f => (
                    <SelectItem key={f.id} value={f.id}>
                      <div className="flex items-center gap-2">{f.name} {getAutomationIdFromForm(f) && <Zap className="h-3 w-3 fill-green-500 text-green-500"/>}</div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {selectedFormId && (
              <div className={cn("p-3 rounded-lg border flex items-center gap-3", automationIdForContext ? "bg-green-50 border-green-200" : "bg-slate-50")}>
                {automationIdForContext ? <Zap className="h-5 w-5 fill-green-600 text-green-600"/> : <Webhook className="h-5 w-5 text-slate-400"/>}
                <div className="text-xs font-semibold">{automationIdForContext ? "Automated via Stage Config" : "Manual Processing Only"}</div>
              </div>
            )}
          </div>
        </div>

        {/* MAIN BODY */}
        <div className="flex-1 overflow-hidden flex flex-col p-6">
          {!selectedFormId ? (
            <div className="flex-1 flex flex-col items-center justify-center space-y-4 rounded-xl border-2 border-dashed bg-white">
              <LayoutGrid className="h-12 w-12 text-slate-200" /><p className="text-slate-500 font-medium">Please select a form to begin configuration.</p>
            </div>
          ) : (
            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
              <TabsList className="w-fit bg-slate-200/50 mb-4">
                <TabsTrigger value="fields" className="px-8">Fields ({webDataGroups.length})</TabsTrigger>
                <TabsTrigger value="documents" className="px-8">Uploads ({selectedKycDocuments.size})</TabsTrigger>
              </TabsList>

              <div className="flex-1 min-h-0 overflow-hidden">
                <TabsContent value="fields" className="h-full m-0 space-y-4 flex flex-col">
                  {/* STEP 2: SEARCH MASTER FIELDS */}
                  <Card className="border-slate-200 flex flex-col min-h-0">
                    <CardHeader className="py-2.5 bg-slate-50/50 border-b flex-shrink-0">
                      <div className="flex items-center justify-between">
                        <Label className="font-bold text-[11px] text-slate-500 uppercase tracking-wider">2. Link Master Fields</Label>
                        <div className="relative w-64"><Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" /><Input value={fieldSearch} onChange={e => setFieldSearch(e.target.value)} placeholder="Filter fields..." className="pl-8 h-8 text-xs bg-white" /></div>
                      </div>
                    </CardHeader>
                    <CardContent className="p-3 overflow-auto max-h-[180px] bg-slate-50/30">
                       <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                        {filteredMasterFields.map(f => {
                          const used = allLinkedMasterFieldIds.has(f.id);
                          return (
                            <div key={f.id} className={cn("flex items-center space-x-2 p-1.5 rounded border bg-white", used && "opacity-50 grayscale bg-slate-50")}>
                              <Checkbox id={`f-${f.id}`} checked={selectedTopLevelFieldIds.has(f.id)} onCheckedChange={c => setSelectedTopLevelFieldIds(prev => {const n = new Set(prev); c ? n.add(f.id) : n.delete(f.id); return n})} disabled={used} />
                              <label htmlFor={`f-${f.id}`} className="text-[11px] font-medium truncate flex-1 cursor-pointer">{f.label}</label>
                              {used && <Check className="h-3 w-3 text-green-600" />}
                            </div>
                          )
                        })}
                       </div>
                    </CardContent>
                    <div className="p-2 border-t flex justify-end"><Button size="sm" onClick={() => {
                        const newGroups = masterFields.filter(f => selectedTopLevelFieldIds.has(f.id)).map(f => ({
                          id: crypto.randomUUID(), efnsDisplayName: f.label, variableName: f.field_key.toLowerCase().replace(/[^a-z0-9]+(.)/g, (_, chr) => chr.toUpperCase()), fieldType: 'text', entityType: 'principal', linkedMasterFields: [f]
                        }));
                        setWebDataGroups(prev => [...prev, ...newGroups]);
                        setSelectedTopLevelFieldIds(new Set());
                    }} disabled={selectedTopLevelFieldIds.size === 0} className="h-7 text-xs">Add Selected</Button></div>
                  </Card>

                  {/* STEP 3: REFINE CONFIG */}
                  <Card className="flex-1 flex flex-col min-h-0 border-slate-200 overflow-hidden shadow-inner">
                    <CardHeader className="py-2 bg-slate-100/50 border-b flex-shrink-0"><CardTitle className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">3. Refine Configuration</CardTitle></CardHeader>
                    <CardContent className="flex-1 overflow-auto p-4 space-y-3 bg-slate-50/50">
                      {webDataGroups.map((group, index) => (
                        <div key={group.id} className="p-4 border rounded-lg bg-white shadow-sm hover:border-blue-300 transition-all relative group">
                          <div className="grid grid-cols-4 gap-4 mb-3">
                            <div className="space-y-1"><Label className="text-[10px] font-bold">Display Name</Label><Input value={group.efnsDisplayName} onChange={e => updateGroup(group.id, 'efnsDisplayName', e.target.value)} className="h-8 text-xs" /></div>
                            <div className="space-y-1"><Label className="text-[10px] font-bold">Variable ID</Label><Input value={group.variableName} onChange={e => updateGroup(group.id, 'variableName', e.target.value)} className="h-8 text-xs font-mono text-blue-600" /></div>
                            <div className="space-y-1"><Label className="text-[10px] font-bold">Input Type</Label><Select value={group.fieldType} onValueChange={v => updateGroup(group.id, 'fieldType', v)}><SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="text">Text</SelectItem><SelectItem value="number">Number</SelectItem><SelectItem value="date">Date</SelectItem><SelectItem value="array">Array (Component Group)</SelectItem></SelectContent></Select></div>
                            <div className="space-y-1"><Label className="text-[10px] font-bold">Target Applicant</Label><Select value={group.entityType} onValueChange={v => updateGroup(group.id, 'entityType', v)}><SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="both">Both</SelectItem><SelectItem value="principal">Principal</SelectItem><SelectItem value="dependant">Dependant</SelectItem></SelectContent></Select></div>
                          </div>
                          
                          <div className="flex flex-wrap gap-2 pt-2 border-t items-center">
                            <span className="text-[9px] font-bold text-slate-400 uppercase">Sources:</span>
                            {group.linkedMasterFields.map(f => <Badge key={f.id} variant="secondary" className="text-[9px] h-5 py-0 px-1 gap-1">{f.label}<X className="h-2.5 w-2.5 cursor-pointer" onClick={() => unlinkMasterFieldFromGroup(group.id, f.id)} /></Badge>)}
                            <MasterFieldPicker availableFields={availableForPicking} onSelect={f => linkMasterFieldToGroup(group.id, f)} />
                          </div>

                          {group.fieldType === 'array' && (
                            <div className="mt-3 p-3 border rounded bg-blue-50/40 space-y-2">
                               <div className="flex justify-between items-center"><Label className="text-[10px] font-bold text-blue-700">Sub-Fields</Label><Button size="xs" variant="outline" className="h-5 text-[9px]" onClick={() => addArrayItem(group.id)}>+ Add Item</Button></div>
                               {group.arrayItems?.map((ai, i) => (
                                 <div key={i} className="flex gap-2 items-end"><Input value={ai.name} onChange={e => handleArrayItemChange(group.id, i, 'name', e.target.value)} placeholder="Name" className="h-7 text-[10px] flex-1 bg-white" /><Input value={ai.variableName} onChange={e => handleArrayItemChange(group.id, i, 'variableName', e.target.value)} placeholder="ID" className="h-7 text-[10px] font-mono flex-1 bg-white" /><Button size="icon" variant="ghost" className="h-7 w-7 text-red-400" onClick={() => removeArrayItem(group.id, i)}><Trash2 className="h-3.5 w-3.5" /></Button></div>
                               ))}
                            </div>
                          )}
                          <Button variant="ghost" size="icon" className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 h-6 w-6 text-slate-300 hover:text-red-500" onClick={() => removeGroup(group.id)}><X className="h-4 w-4" /></Button>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="documents" className="h-full m-0 overflow-auto bg-slate-50 p-4 rounded-lg">
                   <div className="grid grid-cols-3 gap-3">
                      {filteredKycDocuments.map(doc => (
                        <div key={doc.id} className={cn("p-3 border rounded-lg bg-white shadow-sm flex items-start gap-3", selectedKycDocuments.has(doc.id) && "border-blue-500 ring-1 ring-blue-500")}>
                          <Checkbox checked={selectedKycDocuments.has(doc.id)} onCheckedChange={c => {
                             const n = new Map(selectedKycDocuments); c ? n.set(doc.id, 'both') : n.delete(doc.id); setSelectedKycDocuments(n);
                          }} />
                          <div className="flex-1 min-w-0">
                            <p className="text-[12px] font-bold truncate">{doc.display_name}</p>
                            <p className="text-[10px] text-slate-500">{doc.document_type} • {doc.max_file_size_mb}MB</p>
                          </div>
                        </div>
                      ))}
                   </div>
                </TabsContent>
              </div>
            </Tabs>
          )}
        </div>

        <DialogFooter className="p-4 bg-white border-t flex justify-between items-center">
          <div className="text-[11px] font-medium text-slate-500">{webDataGroups.length} Fields link ready</div>
          <div className="flex gap-2"><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={handleSubmit} disabled={!selectedFormId || isSubmitting} className="bg-blue-600 px-6 font-bold">{isSubmitting ? <Loader2 className="h-4 w-4 animate-spin"/> : "Save Configuration"}</Button></div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}