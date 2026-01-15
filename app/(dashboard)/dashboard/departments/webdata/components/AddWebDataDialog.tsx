//@ts-nocheck
"use client"
import { useEffect, useState, useMemo, useCallback } from "react"
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
import supabase from "@/lib/supabase/client"
import { toast } from "@/hooks/use-toast"
import { Check, Link2, Merge, Plus, X, FileText, Upload, User, Users, AlertTriangle, Zap } from "lucide-react"
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
        <Button variant="outline" size="xs" className="text-xs">
          <Plus className="mr-1 h-3 w-3" />Add
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

export function AddWebDataDialog({ isOpen, onOpenChange, context, onSubmit, isSubmitting }: AddWebDataDialogProps) {
  const [activeTab, setActiveTab] = useState<'fields' | 'documents'>('fields')
  const [webDataGroups, setWebDataGroups] = useState<WebDataGroup[]>([])
  const [masterFields, setMasterFields] = useState<JobField[]>([])
  const [formDocuments, setFormDocuments] = useState<FormDocument[]>([])
  const [kycDocuments, setKycDocuments] = useState<KYCDocument[]>([])
  const [selectedKycDocuments, setSelectedKycDocuments] = useState<Map<string, 'principal' | 'dependant' | 'both'>>(new Map())
  const [loadingMasterFields, setLoadingMasterFields] = useState(false)
  const [loadingForms, setLoadingForms] = useState(false)
  const [loadingKyc, setLoadingKyc] = useState(false)
  const [profileSearch, setProfileSearch] = useState('')
  const [companySearch, setCompanySearch] = useState('')
  const [kycSearch, setKycSearch] = useState('')
  const [selectedTopLevelFieldIds, setSelectedTopLevelFieldIds] = useState<Set<number>>(new Set())
  const [selectedGroupIdsForMerge, setSelectedGroupIdsForMerge] = useState<Set<string>>(new Set())
  const [selectedFormId, setSelectedFormId] = useState<string>('')

  const getEntityKeyForContext = useCallback(() => {
    if (!context) return null;
    return `${context.subdepartmentId}:${context.classId || 0}:${context.subclassId || 0}`;
  }, [context]);

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

  const fetchKycDocuments = useCallback(async () => {
    setLoadingKyc(true)
    try {
      const { data, error } = await supabase
        .from('acc_portal_kyc')
        .select('*')
        .order('display_name')

      if (error) throw error

      const kycDocs: KYCDocument[] = (data || []).map(doc => ({
        id: doc.id,
        display_name: doc.display_name,
        document_type: doc.document_type,
        entity_type: doc.entity_type || 'both',
        is_required: doc.is_required || false,
        file_extensions: doc.file_extensions || [],
        max_file_size_mb: doc.max_file_size_mb || 5,
        description: doc.description
      }))

      setKycDocuments(kycDocs)
    } catch (error) {
      console.error('Error fetching KYC documents:', error)
      toast({ title: 'Error', description: 'Failed to load KYC documents', variant: 'destructive' })
    } finally {
      setLoadingKyc(false)
    }
  }, []);

  // Around line 170 in AddWebDataDialog.tsx
const fetchFormDocuments = useCallback(async () => {
  setLoadingForms(true)
  try {
    const { data: departments, error } = await supabase.from('tm_departments').select('stages')
    if (error) throw error

    const allDocuments: any[] = []
    departments?.forEach(dept => {
      if (!dept.stages || !Array.isArray(dept.stages)) return
      dept.stages.forEach((stage: any) => {
        if (stage.documents && Array.isArray(stage.documents)) {
          allDocuments.push(...stage.documents)
        }
      })
    })

    // Filter to only forms and map metadata
    const forms = allDocuments
      .filter((doc: any) => doc.docType === 'form')
      .map((doc: any) => ({
        id: doc.id,
        name: doc.name,
        docType: doc.docType,
        kycId: doc.kycId,
        isRequired: !!doc.isRequired,
        isSpecial: !!doc.isSpecial,
        // Preserve the nested targetEntities array
        targetEntities: Array.isArray(doc.targetEntities) ? doc.targetEntities : []
      }))

    const uniqueForms = Array.from(new Map(forms.map(form => [form.id, form])).values())
    setFormDocuments(uniqueForms)
  } catch (error) {
    console.error('Error fetching forms:', error)
  } finally {
    setLoadingForms(false)
  }
}, []);

  const fetchMasterFields = useCallback(async () => {
    setLoadingMasterFields(true);
    try {
      const { data, error } = await supabase.from('tm_job_fields').select('*').order('label');
      if (error) throw error;
      setMasterFields(data || []);
    } catch (error) {
      console.error('Error fetching master fields:', error);
      toast({ title: 'Error', description: 'Failed to load master fields', variant: 'destructive' })
    } finally {
      setLoadingMasterFields(false)
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchMasterFields();
      fetchFormDocuments();
      fetchKycDocuments();

      // Reset state
      setSelectedTopLevelFieldIds(new Set());
      setSelectedGroupIdsForMerge(new Set());
      setSelectedKycDocuments(new Map());
      setWebDataGroups([]);
      setProfileSearch('');
      setCompanySearch('');
      setKycSearch('');
      setSelectedFormId('');
      setActiveTab('fields');
    }
  }, [isOpen, fetchMasterFields, fetchFormDocuments, fetchKycDocuments]);

  const allLinkedMasterFieldIds = useMemo(() => new Set(webDataGroups.flatMap(g => g.linkedMasterFields.map(f => f.id))), [webDataGroups]);
  const filteredProfileFields = useMemo(() => masterFields.filter(f => f.sources?.some(s => s.source_type === 'profile' || s.source_type === 'document') && f.label?.toLowerCase().includes(profileSearch.toLowerCase())), [masterFields, profileSearch]);
  const filteredCompanyFields = useMemo(() => masterFields.filter(f => f.sources?.some(s => s.source_type === 'company') && f.label?.toLowerCase().includes(companySearch.toLowerCase())), [masterFields, companySearch]);
  const filteredKycDocuments = useMemo(() =>
    kycDocuments.filter(doc =>
      doc.display_name?.toLowerCase().includes(kycSearch.toLowerCase())
    ),
    [kycDocuments, kycSearch]
  );
  const availableForPicking = useMemo(() => masterFields.filter(f => !allLinkedMasterFieldIds.has(f.id)), [masterFields, allLinkedMasterFieldIds]);

const applicableForms = useMemo(() => {
  if (!context || !formDocuments.length) return [];

  return formDocuments.filter(form => {
    // If it's not a special document, it applies to everything (Global)
    if (!form.isSpecial) return true;

    if (!form.targetEntities || form.targetEntities.length === 0) return false;

    return form.targetEntities.some(target => {
      // Access the nested job_level object
      const jl = target.job_level;
      if (!jl) return false;

      // 1. Match Subdepartment
      const subMatch = Number(jl.subdepartment_id) === Number(context.subdepartmentId);
      if (!subMatch) return false;

      // 2. Match Specific Level logic
      if (context.type === 'subdepartment') {
        return jl.level === 2;
      }

      if (context.type === 'class') {
        return jl.level === 3 && String(jl.class_id) === String(context.classId);
      }

      if (context.type === 'subclass') {
        return jl.level === 4 && 
               String(jl.class_id) === String(context.classId) && 
               String(jl.subclass_id) === String(context.subclassId);
      }

      return false;
    });
  });
}, [formDocuments, context]);

  // Get the selected form details
  const selectedForm = useMemo(() => {
    return selectedFormId && selectedFormId !== 'none'
      ? formDocuments.find(f => f.id === selectedFormId)
      : null;
  }, [selectedFormId, formDocuments]);

  // Get automation ID for the current context
  const automationIdForContext = useMemo(() => {
    return getAutomationIdFromForm(selectedForm);
  }, [selectedForm, getAutomationIdFromForm]);

  const handleClose = () => { onOpenChange(false) }

  const handleSubmit = async () => {
    if (webDataGroups.length === 0 && selectedKycDocuments.size === 0) {
      toast({ title: "Nothing to Save", description: "Please add at least one web data field or select documents before saving." });
      return;
    }

    // Check if a form is selected but no automation is configured for this context
    if (selectedForm && !automationIdForContext) {
      toast({
        title: "No Automation Configured",
        description: `The selected form "${selectedForm.name}" does not have an automation configured for this ${context?.type}. Please configure automation links in the stage editor first.`,
        variant: "destructive"
      });
      return;
    }

    try {
      const webDataArray = [];

      const kycDocsUpload = Array.from(selectedKycDocuments.entries()).map(([kycId, entityType]) => {
        const kycDoc = kycDocuments.find(doc => doc.id === kycId);
        if (!kycDoc) return null;

        return {
          kycDocumentId: kycDoc.id,
          entityType: entityType,
          isRequired: kycDoc.is_required,
          documentType: kycDoc.document_type,
          fileExtensions: kycDoc.file_extensions,
          maxFileSizeMb: kycDoc.max_file_size_mb,
          description: kycDoc.description
        };
      }).filter(Boolean);

      if (webDataGroups.length > 0 || kycDocsUpload.length > 0) {
        const webDataFields = webDataGroups.map((group, index) => ({
          name: group.efnsDisplayName,
          efnsDisplayName: group.efnsDisplayName,
          description: `Linked to: ${group.linkedMasterFields.map(f => f.label).join(', ')}`,
          type: 'standard',
          order: index,
          isRequired: group.linkedMasterFields.some(f => f.is_required) || false,
          variableName: group.variableName,
          fieldType: group.fieldType,
          entityType: group.entityType,
          arrayItems: group.arrayItems || [],
          masterFieldIds: group.linkedMasterFields.map(f => f.id.toString()),
          masterFields: group.linkedMasterFields.map(f => ({
            id: f.id,
            label: f.label,
            field_key: f.field_key,
            type: f.type,
            is_required: f.is_required
          })),
          kycDocumentId: group.kycDocumentId || null
        }));

        const newEntry = {
          ...(automationIdForContext && { automationId: automationIdForContext }),
          fields: webDataFields,
          documentId: selectedForm?.id || null,
          documentName: selectedForm?.name || (kycDocsUpload.length > 0 ? 'Document Requirements' : 'Custom Fields'),
          kycDocsUpload: kycDocsUpload
        };

        webDataArray.push(newEntry);
      }

      await onSubmit(webDataArray);

    } catch (error) {
      console.error('Error submitting webData:', error);
      toast({
        title: 'Submission Error',
        description: `Failed to save data. ${error.message}`,
        variant: 'destructive'
      });
    }
  }

  // Helper functions for UI interactions
  const handleCheckboxChange = (fieldId: number, checked: boolean) => {
    setSelectedTopLevelFieldIds(prev => {
      const newSet = new Set(prev);
      if (checked) newSet.add(fieldId);
      else newSet.delete(fieldId);
      return newSet
    })
  }

  const handleKycDocumentToggle = (docId: string, checked: boolean, entityType?: 'principal' | 'dependant' | 'both') => {
    setSelectedKycDocuments(prev => {
      const newMap = new Map(prev);
      if (checked) {
        newMap.set(docId, entityType || 'both');
      } else {
        newMap.delete(docId);
      }
      return newMap;
    });
  }

  const handleKycEntityTypeChange = (docId: string, entityType: 'principal' | 'dependant' | 'both') => {
    setSelectedKycDocuments(prev => {
      const newMap = new Map(prev);
      if (newMap.has(docId)) {
        newMap.set(docId, entityType);
      }
      return newMap;
    });
  }

  const addSelectedFieldsAsGroups = () => {
    const fieldsToAdd = masterFields.filter(f => selectedTopLevelFieldIds.has(f.id));
    const newGroups: WebDataGroup[] = fieldsToAdd.map(field => ({
      id: crypto.randomUUID(),
      efnsDisplayName: field.label,
      variableName: field.field_key.toLowerCase().replace(/[^a-z0-9]+(.)/g, (_, chr) => chr.toUpperCase()),
      fieldType: 'text',
      entityType: 'principal',
      linkedMasterFields: [field]
    }));
    setWebDataGroups(prev => [...prev, ...newGroups]);
    setSelectedTopLevelFieldIds(new Set())
  }

  const updateGroup = (groupId: string, field: keyof WebDataGroup, value: any) => {
    setWebDataGroups(prev => prev.map(g => {
      if (g.id !== groupId) return g;
      const updated = { ...g, [field]: value };
      if (field === 'fieldType' && value === 'array' && !updated.arrayItems) updated.arrayItems = [];
      return updated
    }))
  }

  const removeGroup = (groupId: string) => setWebDataGroups(prev => prev.filter(g => g.id !== groupId))

  const linkMasterFieldToGroup = (groupId: string, field: JobField) => {
    const group = webDataGroups.find(g => g.id === groupId);
    if (group) {
      updateGroup(groupId, 'linkedMasterFields', [...group.linkedMasterFields, field]);
    }
  }

  const unlinkMasterFieldFromGroup = (groupId: string, fieldId: number) => {
    const group = webDataGroups.find(g => g.id === groupId);
    if (group) {
      updateGroup(groupId, 'linkedMasterFields', group.linkedMasterFields.filter(f => f.id !== fieldId));
    }
  }

  const toggleGroupSelectionForMerge = (groupId: string) => {
    setSelectedGroupIdsForMerge(prev => {
      const newSet = new Set(prev);
      if (newSet.has(groupId)) newSet.delete(groupId);
      else newSet.add(groupId);
      return newSet
    })
  }

  const handleMerge = () => {
    const groupsToMerge = webDataGroups.filter(g => selectedGroupIdsForMerge.has(g.id));
    if (groupsToMerge.length < 2) return;

    const firstGroup = groupsToMerge[0];
    const combinedMasterFields = groupsToMerge.flatMap(g => g.linkedMasterFields);
    const newGroup: WebDataGroup = {
      id: crypto.randomUUID(),
      efnsDisplayName: firstGroup.efnsDisplayName,
      variableName: firstGroup.variableName,
      fieldType: firstGroup.fieldType,
      entityType: firstGroup.entityType,
      linkedMasterFields: combinedMasterFields
    };

    setWebDataGroups(prev => [...prev.filter(g => !selectedGroupIdsForMerge.has(g.id)), newGroup]);
    setSelectedGroupIdsForMerge(new Set())
  }

  const addArrayItem = (groupId: string) => {
    const group = webDataGroups.find(g => g.id === groupId);
    const currentItems = group?.arrayItems || [];
    updateGroup(groupId, 'arrayItems', [...currentItems, { name: '', variableName: '', type: 'text' }]);
  }

  const removeArrayItem = (groupId: string, itemIndex: number) => {
    const g = webDataGroups.find(g => g.id === groupId);
    if (!g || !g.arrayItems) return;
    const ni = [...g.arrayItems];
    ni.splice(itemIndex, 1);
    updateGroup(groupId, 'arrayItems', ni)
  }

  const handleArrayItemChange = (groupId: string, itemIndex: number, prop: string, value: string) => {
    const g = webDataGroups.find(g => g.id === groupId);
    if (!g || !g.arrayItems) return;
    const ni = [...g.arrayItems];
    ni[itemIndex] = { ...ni[itemIndex], [prop]: value };
    updateGroup(groupId, 'arrayItems', ni)
  }

  if (!context) return null

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-7xl max-h-[95vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Add WebData & Documents</DialogTitle>
          <DialogDescription>
            Add form fields and document upload requirements for {context.subdepartmentName}
            {context.className && ` → ${context.className}`}
            {context.subclassName && ` → ${context.subclassName}`}
          </DialogDescription>

          <div className="space-y-2 pt-2">
            <Label>Select Form*</Label>
            <Select value={selectedFormId} onValueChange={setSelectedFormId} disabled={loadingForms}>
              <SelectTrigger>
                <SelectValue placeholder={loadingForms ? 'Loading forms...' : 'Select an applicable form'} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No form (Manual Field Entry)</SelectItem>
                {applicableForms.map(form => {
                  // Check if THIS specific form has an automation configured for THIS job level
                  const automationId = getAutomationIdFromForm(form);
                  const hasAutomation = !!automationId;

                  return (
                    <SelectItem key={form.id} value={form.id}>
                      <div className="flex items-center justify-between w-full gap-4">
                        <div className="flex flex-col">
                          <span className="font-medium text-sm">{form.name}</span>
                          <span className="text-[10px] text-muted-foreground italic">
                            {form.isSpecial ? 'Targeted Configuration' : 'Global Configuration'}
                          </span>
                        </div>
                        {hasAutomation ? (
                          <Badge variant="outline" className="ml-auto text-[10px] bg-green-50 text-green-700 border-green-200">
                            <Zap className="h-3 w-3 mr-1 fill-green-700" />
                            Automated
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="ml-auto text-[10px] bg-slate-50 text-slate-400">
                            Manual
                          </Badge>
                        )}
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>

            {/* Show automation status for selected form */}
            {selectedForm && (
              <div className="p-3 rounded-lg border bg-gray-50">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Selected: {selectedForm.name}</p>
                    <p className="text-xs text-gray-600">
                      Entity context: {context.type}
                      {context.type === 'class' && ` (ID: ${context.classId})`}
                      {context.type === 'subclass' && ` (ID: ${context.subclassId})`}
                    </p>
                  </div>

                  {automationIdForContext ? (
                    <Badge variant="outline" className="text-green-600 border-green-300 bg-green-50">
                      <Zap className="h-3 w-3 mr-1 fill-green-600" />
                      Mapped to: {typeof automationIdForContext === 'object'
                        ? automationIdForContext.automationId.slice(0, 8)
                        : automationIdForContext.slice(0, 8)}...
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-amber-600 border-amber-300 bg-amber-50">
                      <AlertTriangle className="h-3 w-3 mr-1" />
                      No Logic Configured
                    </Badge>
                  )}
                </div>

                {!automationIdForContext && (
                  <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800">
                    <AlertTriangle className="h-3 w-3 inline mr-1" />
                    This form doesn't have an automation configured for the current {context.type}.
                    Configure automation links in the stage editor to enable form submission automation.
                  </div>
                )}
              </div>
            )}
          </div>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'fields' | 'documents')} className="flex-1 flex flex-col">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="fields" className="flex items-center space-x-2">
              <FileText className="h-4 w-4" />
              <span>Form Fields ({webDataGroups.length})</span>
            </TabsTrigger>
            <TabsTrigger value="documents" className="flex items-center space-x-2">
              <Upload className="h-4 w-4" />
              <span>Document Uploads ({selectedKycDocuments.size})</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="fields" className="flex-1 flex flex-col space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Select Master Fields</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {['Profile', 'Company'].map(type => {
                    const fields = type === 'Profile' ? filteredProfileFields : filteredCompanyFields;
                    const searchVal = type === 'Profile' ? profileSearch : companySearch;
                    const setSearch = type === 'Profile' ? setProfileSearch : setCompanySearch;
                    return (
                      <div className="space-y-3" key={type}>
                        <Label className="text-base font-medium">{type} Fields</Label>
                        <Input
                          placeholder={`Search ${type.toLowerCase()} fields...`}
                          value={searchVal}
                          onChange={e => setSearch(e.target.value)}
                          className="h-9"
                        />
                        <div className="border rounded-md p-2 h-[200px] overflow-y-auto">
                          {loadingMasterFields ? (
                            <p>Loading...</p>
                          ) : fields.length > 0 ? (
                            <div className="space-y-1">
                              {fields.map(field => {
                                const isInUse = allLinkedMasterFieldIds.has(field.id);
                                const isSelected = selectedTopLevelFieldIds.has(field.id);
                                return (
                                  <div key={field.id} className="flex items-center space-x-3 p-2 hover:bg-gray-50 rounded">
                                    <Checkbox
                                      id={`field-sel-${field.id}`}
                                      checked={isSelected}
                                      onCheckedChange={(checked) => handleCheckboxChange(field.id, checked)}
                                      disabled={isInUse}
                                    />
                                    <label
                                      htmlFor={`field-sel-${field.id}`}
                                      className={cn(
                                        "flex-1 flex items-center justify-between text-sm",
                                        isInUse ? "text-muted-foreground cursor-not-allowed" : "cursor-pointer"
                                      )}
                                    >
                                      <span>{field.label}</span>
                                      {isInUse && (
                                        <Badge variant="outline" className="font-normal text-xs py-0.5 px-1.5">
                                          <Link2 className="h-3 w-3 mr-1" />In Use
                                        </Badge>
                                      )}
                                    </label>
                                  </div>
                                )
                              })}
                            </div>
                          ) : (
                            <div className="h-full flex items-center justify-center text-sm text-gray-500">
                              No fields found.
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
                <div className="flex justify-end mt-4">
                  <Button
                    onClick={addSelectedFieldsAsGroups}
                    disabled={selectedTopLevelFieldIds.size === 0}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Add Selected Fields ({selectedTopLevelFieldIds.size})
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="flex-1">
              <CardHeader>
                <div className="flex justify-between items-center">
                  <CardTitle>Configure Web Data Fields ({webDataGroups.length})</CardTitle>
                  {selectedGroupIdsForMerge.size > 1 && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="outline" size="sm">
                          <Merge className="mr-2 h-4 w-4" />
                          Merge Selected ({selectedGroupIdsForMerge.size})
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Confirm Merge</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will combine {selectedGroupIdsForMerge.size} fields into one.
                            The name and type of the first selected field will be used for the new merged field.
                            You can edit it afterward.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={handleMerge}>Confirm & Merge</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                </div>
              </CardHeader>
              <CardContent className="flex-1 overflow-y-auto space-y-4 h-[calc(30vh)]">
                {webDataGroups.length === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-8">
                    Select fields from above to begin configuring web data fields.
                  </p>
                ) : (
                  webDataGroups.map((group) => (
                    <div key={group.id} className="border rounded-lg p-4 space-y-4 bg-card shadow-sm flex gap-4">
                      <Checkbox
                        id={`group-sel-${group.id}`}
                        checked={selectedGroupIdsForMerge.has(group.id)}
                        onCheckedChange={() => toggleGroupSelectionForMerge(group.id)}
                        className="mt-2"
                      />
                      <div className="flex-grow space-y-4">
                        <div className="flex items-start justify-between">
                          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 flex-grow">
                            <div className="space-y-1">
                              <Label htmlFor={`efnsDisplayName-${group.id}`}>EFNS Display Name</Label>
                              <Input
                                id={`efnsDisplayName-${group.id}`}
                                value={group.efnsDisplayName}
                                onChange={(e) => updateGroup(group.id, 'efnsDisplayName', e.target.value)}
                              />
                            </div>
                            <div className="space-y-1">
                              <Label htmlFor={`variableName-${group.id}`}>Variable Name</Label>
                              <Input
                                id={`variableName-${group.id}`}
                                value={group.variableName}
                                onChange={(e) => updateGroup(group.id, 'variableName', e.target.value)}
                              />
                            </div>
                            <div className="space-y-1">
                              <Label htmlFor={`fieldType-${group.id}`}>Field Type</Label>
                              <Select
                                value={group.fieldType}
                                onValueChange={(value) => updateGroup(group.id, 'fieldType', value)}
                              >
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="text">Text</SelectItem>
                                  <SelectItem value="number">Number</SelectItem>
                                  <SelectItem value="boolean">Boolean</SelectItem>
                                  <SelectItem value="date">Date</SelectItem>
                                  <SelectItem value="select">Select</SelectItem>
                                  <SelectItem value="array">Array</SelectItem>
                                  <SelectItem value="object">Object</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-1">
                              <Label htmlFor={`entityType-${group.id}`}>Entity Type</Label>
                              <Select
                                value={group.entityType}
                                onValueChange={(value) => updateGroup(group.id, 'entityType', value)}
                              >
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="both">
                                    <div className="flex items-center space-x-2">
                                      <Users className="h-4 w-4" />
                                      <span>Both (Principal & Dependant)</span>
                                    </div>
                                  </SelectItem>
                                  <SelectItem value="principal">
                                    <div className="flex items-center space-x-2">
                                      <User className="h-4 w-4" />
                                      <span>Principal Only</span>
                                    </div>
                                  </SelectItem>
                                  <SelectItem value="dependant">
                                    <div className="flex items-center space-x-2">
                                      <User className="h-4 w-4" />
                                      <span>Dependant Only</span>
                                    </div>
                                  </SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 ml-4"
                            onClick={() => removeGroup(group.id)}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>

                        <div className="space-y-2">
                          <Label className="text-xs font-semibold">Linked Master Fields</Label>
                          <div className="flex flex-wrap gap-2 items-center">
                            {group.linkedMasterFields.map(field => (
                              <Badge key={field.id} variant="secondary" className="pl-2 pr-1 py-1">
                                {field.label}
                                <button
                                  onClick={() => unlinkMasterFieldFromGroup(group.id, field.id)}
                                  className="ml-1.5 rounded-full hover:bg-gray-400/20 p-0.5"
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </Badge>
                            ))}
                            <MasterFieldPicker
                              availableFields={availableForPicking}
                              onSelect={(field) => linkMasterFieldToGroup(group.id, field)}
                            />
                          </div>
                        </div>

                        {group.fieldType === 'array' && (
                          <div className="mt-2 p-4 border rounded-lg bg-gray-50/50 space-y-3">
                            <Label className="font-medium">Array Item Structure</Label>
                            {group.arrayItems?.map((arrayItem, itemIdx) => (
                              <div key={itemIdx} className="flex items-end gap-2 p-3 border rounded-md bg-white">
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 flex-grow">
                                  <div className="space-y-1">
                                    <Label className="text-xs">Display Name</Label>
                                    <Input
                                      value={arrayItem.name}
                                      onChange={(e) => handleArrayItemChange(group.id, itemIdx, 'name', e.target.value)}
                                    />
                                  </div>
                                  <div className="space-y-1">
                                    <Label className="text-xs">Variable Name</Label>
                                    <Input
                                      value={arrayItem.variableName}
                                      onChange={(e) => handleArrayItemChange(group.id, itemIdx, 'variableName', e.target.value)}
                                    />
                                  </div>
                                  <div className="space-y-1">
                                    <Label className="text-xs">Type</Label>
                                    <Select
                                      value={arrayItem.type}
                                      onValueChange={(v) => handleArrayItemChange(group.id, itemIdx, 'type', v)}
                                    >
                                      <SelectTrigger><SelectValue /></SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="text">Text</SelectItem>
                                        <SelectItem value="number">Number</SelectItem>
                                        <SelectItem value="boolean">Boolean</SelectItem>
                                        <SelectItem value="date">Date</SelectItem>
                                        <SelectItem value="select">Select</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </div>
                                </div>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => removeArrayItem(group.id, itemIdx)}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            ))}
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => addArrayItem(group.id)}
                            >
                              <Plus className="h-4 w-4 mr-2" />Add Item
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="documents" className="flex-1 flex flex-col space-y-4">
            <Card className="flex-1">
              <CardHeader>
                <CardTitle>Document Upload Requirements</CardTitle>
                <div className="space-y-2">
                  <Label>Search KYC Documents</Label>
                  <Input
                    placeholder="Search document types..."
                    value={kycSearch}
                    onChange={e => setKycSearch(e.target.value)}
                    className="h-9"
                  />
                </div>
              </CardHeader>
              <CardContent className="flex-1 overflow-y-auto h-[50vh]">
                {loadingKyc ? (
                  <div className="flex items-center justify-center h-48">
                    <p>Loading KYC documents...</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {filteredKycDocuments.map(doc => (
                      <div key={doc.id} className="flex items-start space-x-3 p-3 border rounded-lg hover:bg-muted/50">
                        <Checkbox
                          id={`kyc-${doc.id}`}
                          checked={selectedKycDocuments.has(doc.id)}
                          onCheckedChange={(checked) => handleKycDocumentToggle(doc.id, checked, 'both')}
                        />
                        <div className="flex-1 space-y-2">
                          <div className="flex items-center justify-between">
                            <label
                              htmlFor={`kyc-${doc.id}`}
                              className="font-medium cursor-pointer"
                            >
                              {doc.display_name}
                            </label>
                            <div className="flex items-center space-x-2">
                              {doc.is_required && (
                                <Badge variant="destructive" className="text-xs">Required</Badge>
                              )}
                            </div>
                          </div>
                          {doc.description && (
                            <p className="text-sm text-muted-foreground">{doc.description}</p>
                          )}
                          <div className="flex items-center space-x-4 text-xs text-muted-foreground">
                            <span>Type: {doc.document_type}</span>
                            <span>Max size: {doc.max_file_size_mb}MB</span>
                            {doc.file_extensions.length > 0 && (
                              <span>Formats: {doc.file_extensions.join(', ')}</span>
                            )}
                          </div>
                          {selectedKycDocuments.has(doc.id) && (
                            <div className="mt-2">
                              <Label className="text-xs font-medium">Entity Type for Upload</Label>
                              <Select
                                value={selectedKycDocuments.get(doc.id) || 'both'}
                                onValueChange={(value) => handleKycEntityTypeChange(doc.id, value as 'principal' | 'dependant' | 'both')}
                              >
                                <SelectTrigger className="h-8 mt-1">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="both">
                                    <div className="flex items-center space-x-2">
                                      <Users className="h-3 w-3" />
                                      <span>Both (Principal & Dependant)</span>
                                    </div>
                                  </SelectItem>
                                  <SelectItem value="principal">
                                    <div className="flex items-center space-x-2">
                                      <User className="h-3 w-3" />
                                      <span>Principal Only</span>
                                    </div>
                                  </SelectItem>
                                  <SelectItem value="dependant">
                                    <div className="flex items-center space-x-2">
                                      <User className="h-3 w-3" />
                                      <span>Dependant Only</span>
                                    </div>
                                  </SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                    {filteredKycDocuments.length === 0 && (
                      <div className="text-center py-8 text-muted-foreground">
                        <Upload className="h-12 w-12 mx-auto mb-4" />
                        <p>No KYC documents found.</p>
                        <p className="text-sm">Try adjusting your search criteria.</p>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <DialogFooter className="mt-4 pt-4 border-t">
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-4">
              <div className="text-sm text-muted-foreground">
                {webDataGroups.length} fields + {selectedKycDocuments.size} documents = {webDataGroups.length + selectedKycDocuments.size} total items
              </div>

              {/* Show automation status in footer */}
              {selectedForm && (
                <div className="flex items-center gap-2">
                  {automationIdForContext ? (
                    <Badge variant="outline" className="text-green-600 border-green-300">
                      <Check className="h-3 w-3 mr-1" />
                      Automation Ready
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-amber-600 border-amber-300">
                      <AlertTriangle className="h-3 w-3 mr-1" />
                      No Automation
                    </Badge>
                  )}
                </div>
              )}
            </div>

            <div className="flex space-x-2">
              <Button variant="outline" onClick={handleClose} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleSubmit}
                disabled={isSubmitting || (webDataGroups.length === 0 && selectedKycDocuments.size === 0)}
                className={cn(
                  "transition-colors",
                  selectedForm && !automationIdForContext
                    ? "bg-amber-600 hover:bg-amber-700"
                    : "bg-blue-600 hover:bg-blue-700"
                )}
              >
                {isSubmitting ? 'Saving...' : 'Save WebData & Documents'}
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}