// @ts-nocheck
"use client"

import React, { useState, useEffect, useCallback } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Plus, X, Clock, User, FileText, Info, Edit, MessageSquare, Star, Trash2, Check, Zap, Webhook, Layers, LayoutGrid, Link2, Unlink, ChevronDown, ArrowDownCircle, Database, Settings } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from "@/components/ui/command"
import { SearchableSelect } from "@/components/ui/searchable-select"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import supabase from "@/lib/supabase/client"
import type { Stage, TimeConfig, StageDocument, DocumentExtraction, EntityOption } from "../types"
import { createKYCDocument, updateKYCDocument } from "../kycDocuments"
import { toast } from "@/lib/hooks/use-toast"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

type Stage = any; type TimeConfig = any; type StageDocument = any; type DocumentExtraction = any; type EntityOption = any;

const SectionWrapper = ({ title, icon, children, actionButton = null }: { title: string, icon: React.ReactNode, children: React.ReactNode, actionButton?: React.ReactNode }) => (
  <Card className="bg-white rounded-lg shadow-sm border border-slate-200/90 overflow-hidden">
    <div className="p-4 bg-blue-50/50 border-b border-gray-200/50 text-blue-800 flex justify-between items-center">
      <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
        {React.cloneElement(icon as React.ReactElement, { className: "h-5 w-5 text-blue-600" })}
        {title}
      </h3>
      {actionButton}
    </div>
    <CardContent className="p-4 space-y-4">{children}</CardContent>
  </Card>
);

const FormField = ({ label, required = false, description, children }: { label: string, required?: boolean, description?: string, children: React.ReactNode }) => (
  <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-start">
    <div className="space-y-1.5 md:col-span-1">
      <Label className="font-medium text-sm text-gray-700">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </Label>
      {description && <p className="text-xs text-muted-foreground">{description}</p>}
    </div>
    <div className="md:col-span-3">{children}</div>
  </div>
);

const generateId = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
  const r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
  return v.toString(16);
});

const getEntityKey = (jobLevel: any): string => {
  if (!jobLevel) return "missing";
  const sub = jobLevel.subdepartment_id || jobLevel.subdept_id || 'none';
  const cls = jobLevel.class_id || 'none';
  const sc = jobLevel.subclass_id || 'none';
  return `${sub}:${cls}:${sc}`;
};

const transformKycFields = (fields: any[]): DocumentExtraction[] => {
  if (!Array.isArray(fields)) return [];
  return fields.map((field: any) => {
    const isArray = field.type === 'array' || field.isArray === true;
    const transformedField: any = {
      id: field.id || generateId(),
      fieldName: field.name || field.fieldName || '',
      description: field.description || '',
      isRequired: field.isRequired !== false,
      fieldType: isArray ? 'array' : (field.type || field.fieldType || 'text'),
      parentField: field.parentField,
      isArray: isArray,
    };
    if (isArray && field.arrayConfig && Array.isArray(field.arrayConfig.fields)) {
      transformedField.arrayConfig = {
        maxItems: field.arrayConfig.maxItems,
        fields: transformKycFields(field.arrayConfig.fields)
      };
    }
    return transformedField as DocumentExtraction;
  });
};

interface KYCDocument {
  id: string
  name: string
  display_name: string
  department: string
  category: string
  fields: DocumentExtraction[]
  document_type: string
}

interface EditStageDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  stage: Stage | null
  onSave: (stage: Stage) => Promise<void>
  departmentName?: string
  officers?: any[] // Officers data for selection
}

export function EditStageDialog({ open, onOpenChange, stage, onSave, departmentName, officers }: EditStageDialogProps) {
  const [formData, setFormData] = useState<Stage | null>(null);
  const [activeTab, setActiveTab] = useState('general');
  const [saving, setSaving] = useState(false);
  const [entityOptions, setEntityOptions] = useState<EntityOption[]>([]);
  const [loadingEntities, setLoadingEntities] = useState(false);
  const [kycDocuments, setKycDocuments] = useState<KYCDocument[]>([]);
  const [loadingKycDocs, setLoadingKycDocs] = useState(false);
  const [automationTypes, setAutomationTypes] = useState<any[]>([]);
  const [loadingAutomations, setLoadingAutomations] = useState(false);
  const [allMasterFields, setAllMasterFields] = useState<any[]>([]);
  const [loadingMasterFields, setLoadingMasterFields] = useState(false);
  const [allStages, setAllStages] = useState<any[]>([]);

  const getTargetDepartmentName = useCallback(() => {
    return departmentName || stage?.department || "Applications";
  }, [departmentName, stage]);

  useEffect(() => {
    if (stage && open) {
      setFormData({
        ...stage,
        description: stage.description || '',
        status: stage.status || '',
        documents: (stage.documents || []).map(doc => ({
          ...doc,
          extractionSpecs: transformKycFields(doc.extractionSpecs)
        })),
        timeConfigs: stage.timeConfigs?.length ? stage.timeConfigs : [{ applicationType: 'Default', days: 0, hours: 0, minutes: 0 }]
      });
      const targetDepartment = getTargetDepartmentName();
      fetchEntities();
      fetchKYCDocuments(targetDepartment);
      fetchAutomationTypes();
      fetchMasterFields();
      fetchAllStages();
    } else {
      setFormData(null);
    }
    setActiveTab('general');
  }, [stage, open, getTargetDepartmentName]);

  const fetchKYCDocuments = async (targetDepartmentName?: string) => {
    setLoadingKycDocs(true);
    try {
      let query = supabase.from('acc_portal_kyc').select('id, name, display_name, department, category, fields, document_type').order('name');
      // if (targetDepartmentName) {
      //   query = query.eq('department', targetDepartmentName);
      // }
      const { data, error } = await query;
      if (error) throw error;
      const transformedDocs: KYCDocument[] = (data || []).map(doc => ({
        ...doc,
        fields: transformKycFields(doc.fields)
      }));
      setKycDocuments(transformedDocs);
    } catch (error) {
      console.error('Error fetching KYC documents:', error);
      toast({ title: "Error", description: "Failed to load existing documents.", variant: "destructive" });
    } finally {
      setLoadingKycDocs(false);
    }
  };

  const fetchAutomationTypes = async () => {
    setLoadingAutomations(true);
    try {
      const { data, error } = await supabase
        .from('tm_automations')
        .select('id, name, description, webhook_url, webhook_type, is_active')
        .eq('is_active', true)
        .order('name');

      if (error) throw error;
      setAutomationTypes(data || []);
    } catch (error) {
      console.error('Error fetching automation types:', error);
      toast({
        title: 'Error',
        description: 'Failed to load automation types',
        variant: 'destructive'
      });
    } finally {
      setLoadingAutomations(false);
    }
  };

  const fetchMasterFields = async () => {
    setLoadingMasterFields(true);
    try {
      const { data, error } = await supabase
        .from('tm_job_fields')
        .select('id, label, field_key, type, is_required')
        .order('label');
      if (error) throw error;
      setAllMasterFields(data || []);
    } catch (error) {
      console.error('Error fetching master fields:', error);
      toast({ title: 'Error', description: 'Failed to load master fields', variant: 'destructive' });
    } finally {
      setLoadingMasterFields(false);
    }
  };

  const fetchAllStages = async () => {
    try {
      const { data, error } = await supabase
        .from('tm_departments')
        .select('id, name, stages');
      if (error) throw error;
      const stages: any[] = [];
      (data || []).forEach((dept: any) => {
        (dept.stages || []).forEach((stage: any) => {
          stages.push({ ...stage, departmentName: dept.name });
        });
      });
      setAllStages(stages);
    } catch (error) {
      console.error('Error fetching stages:', error);
    }
  };

  const fetchEntities = async () => {
    setLoadingEntities(true);
    try {
      const { data: deptsData, error } = await supabase.from('tm_departments').select(`*, tm_subdepartments (*, classes)`);
      if (error) throw error;

      const entities: EntityOption[] = [];
      deptsData?.forEach((dept: any) => {
        dept.tm_subdepartments?.forEach((subdept: any) => {
          // Level 0: Subdepartment
          entities.push({
            id: subdept.id,
            name: subdept.name,
            type: 'subdept',
            level: 0,
            subdept_id: subdept.id,
            class_id: null,
            subclass_id: null,
            department_id: dept.id
          });

          subdept.classes?.forEach((cls: any) => {
            // Level 1: Class
            entities.push({
              id: cls.id,
              name: `→ ${cls.name}`,
              type: 'class',
              level: 1,
              subdept_id: subdept.id,
              class_id: cls.id,
              subclass_id: null,
              department_id: dept.id
            });

            cls.subClasses?.forEach((subCls: any) => {
              // Level 2: Subclass
              entities.push({
                id: subCls.id,
                name: `→ → ${subCls.name}`,
                type: 'subclass',
                level: 2,
                subdept_id: subdept.id,
                class_id: cls.id,
                subclass_id: subCls.id,
                department_id: dept.id
              });
            });
          });
        });
      });
      setEntityOptions(entities);
    } catch (error) {
      console.error('Error fetching entities:', error);
    } finally {
      setLoadingEntities(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData) return;

    setSaving(true);
    try {
      const targetDepartment = getTargetDepartmentName();

      const docsWithKyc = await Promise.all(
        (formData.documents || []).map(async (doc) => {
          if (!doc.name?.trim()) return doc;

          // 1. Handle KYC Registration/Update logic
          let currentKycId = doc.linkedKycDocument || doc.kycId;

          const kycPayload = {
            name: doc.name,
            fields: doc.extractionSpecs || [],
            display_name: doc.name,
            department: targetDepartment,
            category: 'application-docs',
            document_type: 'one_off'
          };

          if (!currentKycId) {
            currentKycId = await createKYCDocument(kycPayload);
          } else if (!doc.linkedKycDocument) {
            // Only update if it's not a read-only linked document
            await updateKYCDocument(currentKycId, kycPayload);
          }

          // 2. Structure the Automation Links
          // We ensure that if automation is disabled, the object is emptied
          const finalAutomationLinks = doc.hasAutomation ? (doc.automationLinks || {}) : {};

          return {
            id: doc.id,
            name: doc.name,
            description: doc.description,
            isRequired: doc.isRequired,
            documentType: doc.documentType,
            inputType: doc.inputType,
            docType: doc.docType || 'normal_doc',
            isSpecial: !!doc.isSpecial,
            kycId: currentKycId,
            linkedKycDocument: doc.linkedKycDocument,
            hasAutomation: !!doc.hasAutomation,
            // UPDATE: We only save targetEntities. automationLinks is removed.
            targetEntities: doc.targetEntities || []
          };
        })
      );

      const updatedStage = {
        ...formData,
        documents: docsWithKyc,
        updated_at: new Date().toISOString(),
      };

      await onSave(updatedStage);
      onOpenChange(false);
    } catch (error) {
      console.error('Error saving stage:', error);
      toast({ title: "Error", description: "Failed to save stage details.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => (prev ? { ...prev, [name]: value } : null));
  };

  const updateTimeConfig = (index: number, updates: Partial<TimeConfig>) => {
    setFormData(prev => {
      if (!prev) return null;
      const updatedTimeConfigs = [...(prev.timeConfigs || [])];
      updatedTimeConfigs[index] = { ...updatedTimeConfigs[index], ...updates };
      return { ...prev, timeConfigs: updatedTimeConfigs };
    });
  };

  const addTimeConfig = () => {
    setFormData(prev => (prev ? {
      ...prev,
      timeConfigs: [
        ...(prev.timeConfigs || []),
        { applicationType: '', days: 0, hours: 0, minutes: 0 }
      ]
    } : null));
  };

  const removeTimeConfig = (index: number) => {
    setFormData(prev => (prev ? {
      ...prev,
      timeConfigs: prev.timeConfigs?.filter((_, i) => i !== index)
    } : null));
  };

  const getTimeFromMinutes = (minutes: number | null | undefined) => {
    if (minutes === null || minutes === undefined) return { days: 0, hours: 0, minutes: 0 };
    const days = Math.floor(minutes / (24 * 60));
    const remainingMinutes = minutes % (24 * 60);
    const hours = Math.floor(remainingMinutes / 60);
    const mins = remainingMinutes % 60;
    return { days, hours, minutes: mins };
  };

  const { days: totalDays, hours: totalHours, minutes: totalMins } = getTimeFromMinutes(formData?.estimated_time);

  const handleTimeChange = (field: 'days' | 'hours' | 'minutes', value: number) => {
    setFormData(prev => {
      if (!prev) return null;
      const calculateTotalMinutes = (days: number, hours: number, minutes: number) => {
        return (days * 24 * 60) + (hours * 60) + minutes;
      };
      const currentTime = getTimeFromMinutes(prev.estimated_time || 0);
      const newTime = { ...currentTime, [field]: value };
      return {
        ...prev,
        estimated_time: calculateTotalMinutes(newTime.days, newTime.hours, newTime.minutes)
      };
    });
  };

  const addDocument = (isSpecial: boolean = false) => {
    const newDoc: StageDocument = {
      id: generateId(), name: '', description: '', isRequired: false,
      documentType: 'both', inputType: 'file', extractionSpecs: [],
      isSpecial, linkedKycDocument: undefined,
      ...(isSpecial && { targetEntities: [], automationLinks: {} })
    };
    setFormData(prev => (prev ? {
      ...prev,
      documents: [...(prev.documents || []), newDoc]
    } : null));
    setActiveTab('documents');
  };

  const updateDocument = (docId: string, updates: Partial<StageDocument>) => {
    setFormData(prev => {
      if (!prev) return null;
      const newDocuments = prev.documents?.map(doc => {
        if (doc.id === docId) {
          const updatedDoc = { ...doc, ...updates };
          // If targetEntities are updated, clean up any orphaned automationLinks
          if (updates.targetEntities && updatedDoc.automationLinks) {
            const newEntityKeys = new Set(updates.targetEntities.map(getEntityKey));
            const newAutomationLinks = { ...updatedDoc.automationLinks };
            Object.keys(newAutomationLinks).forEach(key => {
              if (!newEntityKeys.has(key)) {
                delete newAutomationLinks[key];
              }
            });
            updatedDoc.automationLinks = newAutomationLinks;
          }
          return updatedDoc;
        }
        return doc;
      });
      return { ...prev, documents: newDocuments };
    });
  };

  const removeDocument = (docId: string) => {
    setFormData(prev => (prev ? {
      ...prev,
      documents: prev.documents?.filter(doc => doc.id !== docId)
    } : null));
  };

  const addExtractionField = (docId: string) => {
    setFormData(prev => {
      if (!prev) return null;
      const newField: DocumentExtraction = {
        id: generateId(), fieldName: '', description: '', isRequired: true, fieldType: 'text'
      };
      return {
        ...prev,
        documents: prev.documents?.map(doc =>
          doc.id === docId ? { ...doc, extractionSpecs: [...(doc.extractionSpecs || []), newField] } : doc
        )
      };
    });
  };

  const updateExtraction = (docId: string, extractionId: string, updates: Partial<DocumentExtraction>) => {
    setFormData(prev => {
      if (!prev) return null;
      return {
        ...prev,
        documents: prev.documents?.map(doc =>
          doc.id === docId ? {
            ...doc,
            extractionSpecs: (doc.extractionSpecs || []).map(ext =>
              ext.id === extractionId ? { ...ext, ...updates } : ext
            )
          } : doc
        )
      };
    });
  };

  const removeExtraction = (docId: string, extractionId: string) => {
    setFormData(prev => {
      if (!prev) return null;
      return {
        ...prev,
        documents: prev.documents?.map(doc =>
          doc.id === docId ? {
            ...doc,
            extractionSpecs: (doc.extractionSpecs || []).filter(ext => ext.id !== extractionId)
          } : doc
        )
      };
    });
  };

  const linkMasterField = (field: any) => {
    setFormData(prev => {
      if (!prev) return null;
      const exists = (prev.linkedMasterFieldIds || []).includes(field.id.toString());
      if (exists) return prev;
      return {
        ...prev,
        linkedMasterFieldIds: [...(prev.linkedMasterFieldIds || []), field.id.toString()],
        linkedMasterFields: [...(prev.linkedMasterFields || []), {
          masterFieldId: field.id.toString(),
          masterFieldLabel: field.label,
          fieldKey: field.field_key,
          fieldType: field.type
        }]
      };
    });
  };

  const unlinkMasterField = (fieldId: string) => {
    setFormData(prev => {
      if (!prev) return null;
      return {
        ...prev,
        linkedMasterFieldIds: (prev.linkedMasterFieldIds || []).filter(id => id !== fieldId),
        linkedMasterFields: (prev.linkedMasterFields || []).filter(f => f.masterFieldId !== fieldId)
      };
    });
  };

  const addDependency = (stageId: string) => {
    setFormData(prev => {
      if (!prev) return null;
      const exists = (prev.dependencies || []).some(d => d.stageId === stageId);
      if (exists) return prev;
      const depStage = allStages.find(s => s.id === stageId);
      return {
        ...prev,
        dependencies: [...(prev.dependencies || []), {
          stageId,
          stageName: depStage?.name || 'Unknown Stage',
          dependencyType: 'visible_when_completed'
        }]
      };
    });
  };

  const updateDependency = (stageId: string, updates: Partial<any>) => {
    setFormData(prev => {
      if (!prev) return null;
      return {
        ...prev,
        dependencies: (prev.dependencies || []).map(dep =>
          dep.stageId === stageId ? { ...dep, ...updates } : dep
        )
      };
    });
  };

  const removeDependency = (stageId: string) => {
    setFormData(prev => {
      if (!prev) return null;
      return {
        ...prev,
        dependencies: (prev.dependencies || []).filter(dep => dep.stageId !== stageId)
      };
    });
  };

  const addDropdownOption = () => {
    setFormData(prev => {
      if (!prev) return null;
      return {
        ...prev,
        dropdownOptions: [...(prev.dropdownOptions || []), '']
      };
    });
  };

  const updateDropdownOption = (index: number, value: string) => {
    setFormData(prev => {
      if (!prev) return null;
      const options = [...(prev.dropdownOptions || [])];
      options[index] = value;
      return { ...prev, dropdownOptions: options };
    });
  };

  const removeDropdownOption = (index: number) => {
    setFormData(prev => {
      if (!prev) return null;
      return {
        ...prev,
        dropdownOptions: (prev.dropdownOptions || []).filter((_, i) => i !== index)
      };
    });
  };

  if (!formData || !stage) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[95vh] p-0 bg-slate-50 flex flex-col">
        <DialogHeader className="p-6 border-b bg-white sticky top-0 z-10">
          <DialogTitle className="text-xl font-bold text-gray-800 flex items-center gap-3">
            <Edit className="h-6 w-6 text-blue-600" />
            Edit Stage: {stage.name}
          </DialogTitle>
          <DialogDescription className="text-sm text-gray-500 !mt-1">
            Update the stage details, timing, and required documents.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-6">
          {(() => {
            const hasLinkedDocuments = formData.documents && formData.documents.length > 0;
            const isInputConfigDisabled = hasLinkedDocuments;
            return (
          <Tabs value={isInputConfigDisabled && activeTab === 'input-config' ? 'general' : activeTab} onValueChange={(val) => {
            if (val === 'input-config' && isInputConfigDisabled) return;
            setActiveTab(val);
          }}>
            <TabsList className="grid w-full grid-cols-3 bg-slate-200/70 p-1">
              <TabsTrigger value="general" className="data-[state=active]:bg-white data-[state=active]:text-blue-600 data-[state=active]:shadow-sm flex items-center gap-2">
                <Info className="h-4 w-4" />
                General & Timing
              </TabsTrigger>
              <TabsTrigger
                value="input-config"
                className={`data-[state=active]:bg-white data-[state=active]:text-blue-600 data-[state=active]:shadow-sm flex items-center gap-2 ${isInputConfigDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                disabled={isInputConfigDisabled}
              >
                <Settings className="h-4 w-4" />
                Input Type
                {isInputConfigDisabled && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="text-[10px] text-muted-foreground ml-1">(Doc linked)</span>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="text-xs">Unlink documents first to change input type</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </TabsTrigger>
              <TabsTrigger value="documents" className="data-[state=active]:bg-white data-[state=active]:text-blue-600 data-[state=active]:shadow-sm flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Documents
                {formData.documents && formData.documents.length > 0 && (
                  <Badge variant="secondary" className="ml-2 h-5 text-xs bg-blue-100 text-blue-800">
                    {formData.documents.length}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>

            <form onSubmit={handleSubmit}>
              <TabsContent value="general" className="mt-6 space-y-6">
                <SectionWrapper title="Basic Information" icon={<Edit />}>
                  <FormField label="Stage Name" required description="A clear, descriptive name for the stage.">
                    <Input id="name" name="name" value={formData.name || ''} onChange={handleInputChange} placeholder="e.g., Application Review" required />
                  </FormField>
                  <FormField label="Status" description="Current status of this stage (e.g., To Enquire)">
                    <Input id="status" name="status" value={formData.status || ''} onChange={handleInputChange} placeholder="e.g., To Enquire" className="font-medium text-blue-600" />
                  </FormField>
                  <Separator />
                  <FormField label="Description" description="Explain the purpose and activities of this stage.">
                    <Textarea id="description" name="description" value={formData.description || ''} onChange={handleInputChange} placeholder="e.g., Review the submitted application form for completeness..." rows={3} />
                  </FormField>
                </SectionWrapper>
                <SectionWrapper title="Timing & Follow-up" icon={<Clock />}>
                  <div className="space-y-4">
                    <div className="flex items-center space-x-3">
                      <Checkbox id="isSpecial" checked={formData.isSpecial} onCheckedChange={(checked) => setFormData(prev => (prev ? { ...prev, isSpecial: Boolean(checked) } : null))} className="data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600" />
                      <div>
                        <Label htmlFor="isSpecial" className="font-medium flex items-center gap-2 text-gray-800">Variable Time Requirements</Label>
                        <p className="text-sm text-muted-foreground">Set different time requirements by application type.</p>
                      </div>
                    </div>
                    {formData.isSpecial ? (
                      <Card className="shadow-none border-slate-200">
                        <CardHeader className="p-4 bg-slate-50/50 border-b">
                          <div className="flex justify-between items-center">
                            <CardTitle className="text-sm font-semibold text-slate-800">Time Configurations</CardTitle>
                            <Button type="button" variant="outline" size="sm" onClick={addTimeConfig} className="text-blue-600 border-blue-300 hover:bg-blue-50">
                              <Plus className="h-4 w-4 mr-2" /> Add Config
                            </Button>
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-4 p-4">
                          {formData.timeConfigs?.map((config, index) => (
                            <div key={index} className="grid md:grid-cols-6 gap-3 items-end p-3 border rounded-lg bg-white">
                              <div className="md:col-span-2">
                                <Label className="text-xs text-gray-600">Application Type</Label>
                                <Input value={config.applicationType || ''} onChange={(e) => updateTimeConfig(index, { applicationType: e.target.value })} placeholder="e.g., Standard, Express" />
                              </div>
                              <div>
                                <Label className="text-xs text-gray-600">Days</Label>
                                <Input type="number" min="0" value={config.days || 0} onChange={(e) => updateTimeConfig(index, { days: parseInt(e.target.value) || 0 })} />
                              </div>
                              <div>
                                <Label className="text-xs text-gray-600">Hours</Label>
                                <Input type="number" min="0" max="23" value={config.hours || 0} onChange={(e) => updateTimeConfig(index, { hours: parseInt(e.target.value) || 0 })} />
                              </div>
                              <div>
                                <Label className="text-xs text-gray-600">Minutes</Label>
                                <Input type="number" min="0" max="59" value={config.minutes || 0} onChange={(e) => updateTimeConfig(index, { minutes: parseInt(e.target.value) || 0 })} />
                              </div>
                              <div>
                                <Button type="button" variant="ghost" size="icon" onClick={() => removeTimeConfig(index)} disabled={formData.timeConfigs?.length === 1} className="hover:text-destructive">
                                  <Trash2 className="h-4 w-4 text-red-500" />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </CardContent>
                      </Card>
                    ) : (
                      <FormField label="Fixed Duration" description="How long this stage typically takes.">
                        <div className="grid grid-cols-3 gap-3">
                          <div><Input type="number" min="0" value={totalDays} onChange={(e) => handleTimeChange('days', parseInt(e.target.value) || 0)} /><Label className="block text-center text-xs text-muted-foreground mt-1.5">Days</Label></div>
                          <div><Input type="number" min="0" max="23" value={totalHours} onChange={(e) => handleTimeChange('hours', Math.min(23, parseInt(e.target.value) || 0))} /><Label className="block text-center text-xs text-muted-foreground mt-1.5">Hours</Label></div>
                          <div><Input type="number" min="0" max="59" value={totalMins} onChange={(e) => handleTimeChange('minutes', Math.min(59, parseInt(e.target.value) || 0))} /><Label className="block text-center text-xs text-muted-foreground mt-1.5">Minutes</Label></div>
                        </div>
                      </FormField>
                    )}
                  </div>
                  <Separator />
                  <FormField label="Follow Up With" description="Who to contact when this stage is done.">
                    <SearchableSelect
                      value={formData.follow_up || 'none'}
                      onValueChange={(value) => setFormData(prev => (prev ? { ...prev, follow_up: value === 'none' ? null : value as 'Client' | 'Officer' | 'BCL', officer_ids: value === 'Officer' ? prev.officer_ids : [] } : null))}
                      options={[
                        { value: 'none', label: 'No follow up required' },
                        { value: 'Client', label: 'Client' },
                        { value: 'Officer', label: 'Officer' },
                        { value: 'BCL', label: 'BCL' }
                      ]}
                      placeholder="Select follow up person"
                    />
                  </FormField>
                  {formData.follow_up === 'Officer' && (
                    <FormField label="Assign Officers" description="Select the specific officers to follow up with.">
                      <MultiOfficerPicker officers={officers || []} selectedOfficerIds={formData.officer_ids || []} onSelectionChange={(selectedIds) => setFormData(prev => prev ? { ...prev, officer_ids: selectedIds } : null)} />
                    </FormField>
                  )}
                </SectionWrapper>
                <SectionWrapper title="Stage Dependencies" icon={<ArrowDownCircle />}>
                  <p className="text-sm text-muted-foreground -mt-2">Define whether this stage depends on other stages for visibility or execution order.</p>
                  <FormField label="Depends On" description="Select stages that must be completed before this one becomes visible.">
                    <div className="space-y-3">
                      <SearchableSelect
                        value=""
                        onValueChange={(value) => {
                          if (value && value !== 'none') {
                            addDependency(value);
                          }
                        }}
                        options={[
                          { value: 'none', label: '-- Add a dependency --' },
                          ...allStages
                            .filter(s => s.id !== stage?.id && !(formData.dependencies || []).some(d => d.stageId === s.id))
                            .map(s => ({ value: s.id, label: s.departmentName ? `${s.name} (${s.departmentName})` : s.name }))
                        ]}
                        placeholder="Choose a stage to depend on"
                      />
                      {(formData.dependencies || []).length > 0 && (
                        <div className="space-y-2">
                          {(formData.dependencies || []).map((dep) => (
                            <div key={dep.stageId} className="flex items-center gap-3 p-3 border rounded-lg bg-slate-50">
                              <ArrowDownCircle className="h-4 w-4 text-blue-600 flex-shrink-0" />
                              <div className="flex-1 min-w-0">
                                <span className="text-sm font-medium text-gray-800 truncate block">{dep.stageName || 'Unknown Stage'}</span>
                              </div>
                              <SearchableSelect
                                value={dep.dependencyType}
                                onValueChange={(value) => updateDependency(dep.stageId, { dependencyType: value })}
                                options={[
                                  { value: 'visible_when_completed', label: 'Visible when completed' },
                                  { value: 'visible_when_started', label: 'Visible when started' },
                                  { value: 'always_visible', label: 'Always visible (marked)' },
                                  { value: 'sequential', label: 'Sequential (must complete first)' }
                                ]}
                                className="w-48"
                              />
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                onClick={() => removeDependency(dep.stageId)}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                      {(formData.dependencies || []).length === 0 && (
                        <p className="text-xs text-muted-foreground italic">No dependencies configured. This stage will be independently visible.</p>
                      )}
                    </div>
                  </FormField>
                </SectionWrapper>
              </TabsContent>
              <TabsContent value="input-config" className="mt-6 space-y-6">
                <SectionWrapper title="Stage Input Type" icon={<Settings />}>
                  <p className="text-sm text-muted-foreground -mt-2">Define what type of input this stage expects from the user. Choose between document upload, text fields, dropdowns, or other input types.</p>
                  <FormField label="Input Type" description="Select the primary input type for this stage.">
                    <SearchableSelect
                      value={formData.stageInputType || 'document'}
                      onValueChange={(value) => setFormData(prev => prev ? { ...prev, stageInputType: value as any } : null)}
                      options={[
                        { value: 'document', label: 'Document (Upload & Extraction)' },
                        { value: 'text', label: 'Text Input' },
                        { value: 'textarea', label: 'Multi-line Text' },
                        { value: 'number', label: 'Number Input' },
                        { value: 'date', label: 'Date Picker' },
                        { value: 'datetime', label: 'Date & Time Picker' },
                        { value: 'dropdown', label: 'Dropdown (Single Select)' },
                        { value: 'multiselect', label: 'Multi-Select' },
                        { value: 'checkbox', label: 'Checkbox (Yes/No)' },
                        { value: 'file', label: 'File Upload Only' },
                        { value: 'url', label: 'URL Input' },
                        { value: 'email', label: 'Email Input' },
                        { value: 'phone', label: 'Phone Number' }
                      ]}
                      placeholder="Select input type"
                    />
                  </FormField>

                  {(formData.stageInputType === 'text' || formData.stageInputType === 'textarea' || formData.stageInputType === 'number' || formData.stageInputType === 'url' || formData.stageInputType === 'email' || formData.stageInputType === 'phone' || formData.stageInputType === 'date' || formData.stageInputType === 'datetime') && (
                    <FormField label="Default Value" description="Pre-filled value for this field (optional).">
                      <Input
                        value={formData.defaultValue || ''}
                        onChange={(e) => setFormData(prev => prev ? { ...prev, defaultValue: e.target.value } : null)}
                        placeholder={formData.stageInputType === 'date' ? 'dd/mm/yyyy' : formData.stageInputType === 'datetime' ? 'dd/mm/yyyy hh:mm' : 'Enter default value...'}
                        type={formData.stageInputType === 'number' ? 'number' : 'text'}
                      />
                    </FormField>
                  )}

                  {(formData.stageInputType === 'dropdown' || formData.stageInputType === 'multiselect') && (
                    <div className="space-y-4">
                      <FormField label="Dropdown Options" description="Define the available options for this field.">
                        <div className="space-y-2">
                          {(formData.dropdownOptions || []).map((option, index) => (
                            <div key={index} className="flex items-center gap-2">
                              <Input
                                value={option}
                                onChange={(e) => updateDropdownOption(index, e.target.value)}
                                placeholder={`Option ${index + 1}`}
                                className="flex-1"
                              />
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => removeDropdownOption(index)}
                                disabled={(formData.dropdownOptions || []).length <= 1}
                                className="hover:text-destructive"
                              >
                                <X className="h-4 w-4 text-red-500" />
                              </Button>
                            </div>
                          ))}
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={addDropdownOption}
                            className="text-blue-600 border-blue-300 hover:bg-blue-50"
                          >
                            <Plus className="h-4 w-4 mr-2" /> Add Option
                          </Button>
                        </div>
                      </FormField>
                    </div>
                  )}
                </SectionWrapper>

                <SectionWrapper title="Master Field Linking" icon={<Link2 />}>
                  <p className="text-sm text-muted-foreground -mt-2">Link this stage to master fields from the job fields database. This enables automatic data resolution from existing data sources.</p>
                  <FormField label="Linked Master Fields" description="Select master fields to link this stage to.">
                    <div className="space-y-3">
                      <SearchableSelect
                        value=""
                        onValueChange={(value) => {
                          if (value && value !== 'none') {
                            const field = allMasterFields.find(f => f.id.toString() === value);
                            if (field) linkMasterField(field);
                          }
                        }}
                        options={[
                          { value: 'none', label: '-- Select a master field to link --' },
                          ...allMasterFields
                            .filter(f => !(formData.linkedMasterFieldIds || []).includes(f.id.toString()))
                            .map(f => ({ value: f.id.toString(), label: `${f.label} (${f.type || 'text'})` }))
                        ]}
                        placeholder={loadingMasterFields ? "Loading master fields..." : "Choose a master field"}
                        disabled={loadingMasterFields}
                      />
                      {(formData.linkedMasterFields || []).length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {(formData.linkedMasterFields || []).map((field) => (
                            <Badge
                              key={field.masterFieldId}
                              variant="secondary"
                              className="flex items-center gap-1 text-xs bg-blue-100 text-blue-800 hover:bg-blue-200"
                            >
                              <Link2 className="h-3 w-3" />
                              {field.masterFieldLabel || field.fieldKey || field.masterFieldId}
                              <Badge variant="outline" className="text-[10px] ml-1 bg-white">{field.fieldType || 'text'}</Badge>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-4 w-4 ml-1 p-0 hover:bg-destructive hover:text-destructive-foreground rounded-full"
                                onClick={() => unlinkMasterField(field.masterFieldId)}
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            </Badge>
                          ))}
                        </div>
                      )}
                      {(formData.linkedMasterFields || []).length === 0 && !loadingMasterFields && (
                        <p className="text-xs text-muted-foreground italic">No master fields linked. Select a field above to link it.</p>
                      )}
                    </div>
                  </FormField>
                </SectionWrapper>

              </TabsContent>
              <TabsContent value="documents" className="mt-6 space-y-6">
                <SectionWrapper title="Stage Documents" icon={<FileText />} actionButton={
                  <div className="flex gap-2">
                    <Button type="button" onClick={() => addDocument(false)} size="sm" variant="outline" className="text-white bg-blue-600 border-blue-300 hover:bg-blue-50"><Plus className="h-4 w-4 mr-2" />Add Regular</Button>
                    <Button type="button" onClick={() => addDocument(true)} size="sm" variant="outline" disabled={!entityOptions.length && !loadingEntities} title={!entityOptions.length ? "Loading entities..." : ""} className="text-white bg-amber-600 border-amber-300 hover:bg-amber-50"><Star className="h-4 w-4 mr-2" />Add Special</Button>
                  </div>
                }>
                  <p className="text-sm text-muted-foreground -mt-2">Define documents for this stage. New documents will be added to the KYC system under the <span className="font-semibold text-blue-700">{getTargetDepartmentName()}</span> department.</p>
                  {(formData.documents || []).length > 0 ? (
                    <div className="space-y-4 pt-4 border-t">
                      {(formData.documents || []).map((doc, index) => (
                        <DocumentCard key={doc.id || index} doc={doc} docIndex={index} entityOptions={entityOptions} loadingEntities={loadingEntities} kycDocuments={kycDocuments} loadingKycDocs={loadingKycDocs} automationTypes={automationTypes} loadingAutomations={loadingAutomations} onUpdateDocument={updateDocument} onRemoveDocument={removeDocument} onAddExtraction={addExtractionField} onUpdateExtraction={updateExtraction} onRemoveExtraction={removeExtraction} formData={formData} />
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 border-2 border-dashed border-gray-300 rounded-lg bg-white">
                      <FileText className="h-10 w-10 mx-auto mb-3 text-gray-400" />
                      <h4 className="font-medium text-gray-700 mb-1">No documents added yet</h4>
                      <p className="text-sm text-muted-foreground">Add documents that are required for this stage.</p>
                    </div>
                  )}
                </SectionWrapper>
              </TabsContent>
            </form>
          </Tabs>
          );
          })()}
        </div>

        <DialogFooter className="p-4 bg-white border-t sticky z-10">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button type="button" onClick={handleSubmit} disabled={saving || !formData.name.trim()} className="bg-blue-600 hover:bg-blue-700">
            {saving ? (<><div className="w-4 h-4 border-2 border-muted border-t-current rounded-full animate-spin mr-2"></div>Saving...</>) : ('Save Changes')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MultiEntityPicker({ entities, selectedEntities = [], onSelectionChange, loading = false, placeholder = "Select target entities..." }: { entities: EntityOption[], selectedEntities: Array<{ entityType: 'subdept' | 'class' | 'subclass', subdept_id: number, class_id?: string | number, subclass_id?: string | number, entityName: string }>, onSelectionChange: (selectedEntities: any[]) => void, loading?: boolean, placeholder?: string }) {
  const [open, setOpen] = useState(false);
  // Inside MultiEntityPicker (around line 301)
  // Inside MultiEntityPicker (around line 301)
  const toggleEntity = (entity: EntityOption) => {
    // Use the same helper to get a comparable key for the selection
    const entityKey = getEntityKey(entity);

    // Check if this specific entity key already exists in our targeted list
    const isSelected = selectedEntities.some(selected =>
      getEntityKey(selected?.job_level) === entityKey
    );

    if (isSelected) {
      onSelectionChange(selectedEntities.filter(selected =>
        getEntityKey(selected?.job_level) !== entityKey
      ));
    } else {
      const newEntity = {
        entityName: entity.name.replace(/^→\s*/g, ''),
        automationId: null,
        job_level: {
          department_id: entity.department_id,
          subdepartment_id: entity.subdept_id || 0,
          class_id: entity.class_id || null,
          subclass_id: entity.subclass_id || null,
          level: entity.subclass_id ? 4 : entity.class_id ? 3 : 2
        }
      };
      onSelectionChange([...selectedEntities, newEntity]);
    }
  };
  const isEntitySelected = (entity: EntityOption) => selectedEntities.some(selected => getEntityKey(selected) === getEntityKey(entity));
  const groupedEntities = entities.reduce((acc, entity) => {
    const subdeptName = entities.find(e => e.type === 'subdept' && e.subdept_id === entity.subdept_id)?.name || 'Unknown';
    if (!acc[subdeptName]) { acc[subdeptName] = []; }
    acc[subdeptName].push(entity);
    return acc;
  }, {} as Record<string, EntityOption[]>);

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" role="combobox" aria-expanded={open} className="w-full justify-between bg-white" disabled={loading}>
            {selectedEntities.length === 0 ? <span className="text-muted-foreground">{loading ? "Loading entities..." : placeholder}</span> : <span>{selectedEntities.length} entit{selectedEntities.length === 1 ? 'y' : 'ies'} selected</span>}
            <X className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-96 p-0"><Command><CommandInput placeholder="Search entities..." /><CommandEmpty>No entities found.</CommandEmpty>
          <div className="max-h-72 overflow-y-auto">
            {Object.entries(groupedEntities).map(([subdeptName, subdeptEntities]) => (
              <CommandGroup key={subdeptName} heading={subdeptName}>
                {subdeptEntities.sort((a, b) => a.level - b.level).map((entity) => (
                  <CommandItem key={getEntityKey(entity)} onSelect={() => toggleEntity(entity)} className="flex items-center gap-2">
                    <div className="flex items-center gap-2 flex-1">
                      <div className="flex h-4 w-4 items-center justify-center">{isEntitySelected(entity) && <Check className="h-3 w-3 text-blue-600" />}</div>
                      <span style={{ marginLeft: `${entity.level * 12}px` }}>{entity.name}</span>
                      <Badge variant="outline" className="text-xs">{entity.type}</Badge>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </div>
        </Command></PopoverContent>
      </Popover>
      {selectedEntities.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {selectedEntities.map((entity, index) => (
            <Badge key={`${getEntityKey(entity.job_level)}-${index}`} variant="secondary" className="flex items-center gap-1 text-xs bg-blue-100 text-blue-800 hover:bg-blue-200">
              {entity.entityName}
              <Badge variant="outline" className="text-xs ml-1 bg-white">{entity.entityType}</Badge>
              <Button type="button" variant="ghost" size="icon" className="h-4 w-4 ml-1 p-0 hover:bg-destructive hover:text-destructive-foreground rounded-full" onClick={() => onSelectionChange(selectedEntities.filter((_, i) => i !== index))}>
                <X className="h-3 w-3" />
              </Button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

function MultiOfficerPicker({ officers, selectedOfficerIds = [], onSelectionChange }: { officers: any[]; selectedOfficerIds: string[]; onSelectionChange: (selectedIds: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const toggleOfficer = (officerId: string) => {
    if (selectedOfficerIds.includes(officerId)) {
      onSelectionChange(selectedOfficerIds.filter(id => id !== officerId));
    } else {
      onSelectionChange([...selectedOfficerIds, officerId]);
    }
  };
  const isOfficerSelected = (officerId: string) => selectedOfficerIds.includes(officerId);

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" role="combobox" aria-expanded={open} className="w-full justify-between bg-white">
            {selectedOfficerIds.length === 0 ? <span className="text-muted-foreground">Select officers...</span> : <span>{selectedOfficerIds.length} officer{selectedOfficerIds.length === 1 ? '' : 's'} selected</span>}
            <X className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-96 p-0">
          <Command>
            <CommandInput placeholder="Search officers..." />
            <CommandEmpty>No officers found.</CommandEmpty>
            <div className="max-h-72 overflow-y-auto">
              <CommandGroup>
                {officers.map((officer) => (
                  <CommandItem key={officer.id} onSelect={() => toggleOfficer(officer.id)} className="flex items-center gap-2">
                    <div className="flex items-center gap-2 flex-1">
                      <div className="flex h-4 w-4 items-center justify-center">{isOfficerSelected(officer.id) && <Check className="h-3 w-3 text-blue-600" />}</div>
                      <span>{officer.displayName || officer.name}</span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </div>
          </Command>
        </PopoverContent>
      </Popover>
      {selectedOfficerIds.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {selectedOfficerIds.map((officerId) => {
            const officer = officers.find(o => o.id === officerId);
            if (!officer) return null;
            return (
              <Badge key={officerId} variant="secondary" className="flex items-center gap-1 text-xs bg-blue-100 text-blue-800 hover:bg-blue-200">
                {officer.displayName || officer.name}
                <Button variant="ghost" size="icon" className="h-4 w-4 ml-1 p-0 hover:bg-destructive hover:text-destructive-foreground rounded-full" onClick={() => toggleOfficer(officerId)}>
                  <X className="h-3 w-3" />
                </Button>
              </Badge>
            );
          })}
        </div>
      )}
    </div>
  );
}

function DocumentCard({ doc, docIndex, entityOptions, loadingEntities, kycDocuments, loadingKycDocs, automationTypes, loadingAutomations, onUpdateDocument, onRemoveDocument, onAddExtraction, onUpdateExtraction, onRemoveExtraction, formData }: { doc: StageDocument, docIndex: number, entityOptions: EntityOption[], loadingEntities: boolean, kycDocuments: KYCDocument[], loadingKycDocs: boolean, automationTypes: any[], loadingAutomations: boolean, onUpdateDocument: (docId: string, updates: Partial<StageDocument>) => void, onRemoveDocument: (docId: string) => void, onAddExtraction: (docId: string) => void, onUpdateExtraction: (docId: string, extractionId: string, updates: Partial<DocumentExtraction>) => void, onRemoveExtraction: (docId: string, extractionId: string) => void, formData: Stage | null }) {
  const [documentMode, setDocumentMode] = useState<'new' | 'existing'>(doc.linkedKycDocument ? 'existing' : 'new');
  const handleModeChange = (mode: 'new' | 'existing') => {
    setDocumentMode(mode);
    if (mode === 'new') {
      onUpdateDocument(doc.id, { linkedKycDocument: undefined, name: doc.kycId ? doc.name : '', extractionSpecs: doc.kycId ? doc.extractionSpecs : [] });
    }
  };
  const handleKycDocumentSelect = (kycDocId: string) => {
    const selectedKycDoc = kycDocuments.find(d => d.id === kycDocId);
    if (selectedKycDoc) {
      onUpdateDocument(doc.id, { linkedKycDocument: selectedKycDoc.id, kycId: selectedKycDoc.id, name: selectedKycDoc.display_name || selectedKycDoc.name, docType: doc.docType || 'normal_doc', extractionSpecs: selectedKycDoc.fields || [] });
    }
  };
  const isLinkedDocument = Boolean(doc.linkedKycDocument);

  return (
    <Card className={`shadow-sm border-slate-200 ${doc.isSpecial ? 'border-amber-300 bg-amber-50/30' : 'bg-white'}`}>
      <CardHeader className="p-4 bg-slate-50/50 border-b">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-3">
            <h5 className="font-semibold text-sm text-gray-800 flex items-center gap-2">
              {doc.isSpecial && <Star className="h-4 w-4 text-amber-500" />}
              Document {docIndex + 1}: {doc.name || 'Untitled'}
            </h5>
            {isLinkedDocument && <Badge className="text-xs bg-blue-100 text-blue-800 hover:bg-blue-100">Linked</Badge>}
          </div>
          <Button type="button" variant="ghost" size="icon" onClick={() => onRemoveDocument(doc.id)} className="text-muted-foreground hover:text-destructive h-7 w-7"><Trash2 className="h-4 w-4 text-red-500" /></Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6 p-4">
        <div className="space-y-3 p-4 bg-slate-100/70 border border-slate-200 rounded-lg">
          <Label className="font-medium text-gray-700">Document Source</Label>
          <div className="grid grid-cols-2 gap-3">
            <Button type="button" variant={documentMode === 'new' ? 'default' : 'outline'} size="sm" onClick={() => handleModeChange('new')} className={`justify-start ${documentMode === 'new' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-white'}`}><Plus className="h-4 w-4 mr-2" />{doc.kycId && !doc.linkedKycDocument ? "Edit as New" : "Create New"}</Button>
            <Button type="button" variant={documentMode === 'existing' ? 'default' : 'outline'} size="sm" onClick={() => handleModeChange('existing')} className={`justify-start ${documentMode === 'existing' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-white'}`} disabled={loadingKycDocs}><FileText className="h-4 w-4 mr-2" /> Link Existing</Button>
          </div>
          {documentMode === 'existing' && (<div className="space-y-2 pt-2"><Label className="text-sm text-gray-600">Select Existing Document</Label><SearchableSelect options={kycDocuments.map(d => ({ value: d.id, label: d.display_name || d.name }))} value={doc.linkedKycDocument || ''} onValueChange={handleKycDocumentSelect} placeholder={loadingKycDocs ? "Loading..." : "Choose a document"} emptyText="No documents found" disabled={loadingKycDocs} loading={loadingKycDocs} className="w-full bg-white" /><p className="text-xs text-green-600 flex items-center gap-1"><Check className="h-3 w-3" /> Document linked. Fields are now read-only.</p></div>)}
        </div>
        {doc.isSpecial && (<div className="space-y-2 p-4 bg-amber-50 border border-amber-300 rounded-lg"><Label className="font-medium flex items-center gap-2 text-amber-800"><Star className="h-4 w-4 text-amber-500" />Target Entities</Label><MultiEntityPicker entities={entityOptions} selectedEntities={doc.targetEntities || []} onSelectionChange={(selectedEntities) => onUpdateDocument(doc.id, { targetEntities: selectedEntities })} loading={loadingEntities} placeholder="Select which entities need this document..." /></div>)}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="space-y-2"><Label className="text-xs font-medium text-gray-700">Document Name *</Label><Input value={doc.name || ''} onChange={(e) => onUpdateDocument(doc.id, { name: e.target.value })} placeholder="e.g., Application Form" disabled={isLinkedDocument} /></div>
          <div className="space-y-2"><Label className="text-xs font-medium text-gray-700">Document Type</Label><SearchableSelect value={doc.documentType} onValueChange={(value) => onUpdateDocument(doc.id, { documentType: value })} options={[{ value: 'upload', label: 'Upload Only' }, { value: 'extraction', label: 'Data Extraction Only' }, { value: 'both', label: 'Upload + Extraction' }]} placeholder="Select document type" /></div>
          <div className="space-y-2"><Label className="text-xs font-medium text-gray-700">Input Type</Label><SearchableSelect value={doc.inputType || 'file'} onValueChange={(value) => onUpdateDocument(doc.id, { inputType: value })} options={[{ value: 'file', label: 'File Upload' }, { value: 'message', label: 'Message/Text' }, { value: 'both', label: 'Both' }]} placeholder="Select input type" /></div>
          <div className="space-y-2"><Label className="text-xs font-medium text-gray-700">Doc Type</Label><SearchableSelect value={doc.docType || 'normal_doc'} onValueChange={(value: 'form' | 'normal_doc') => onUpdateDocument(doc.id, { docType: value })} options={[{ value: 'form', label: 'Form' }, { value: 'normal_doc', label: 'Normal Doc' }]} placeholder="Select doc type" /></div>
        </div>
        <div className="space-y-2"><Label className="text-xs font-medium text-gray-700">Description</Label><Textarea value={doc.description || ''} onChange={(e) => onUpdateDocument(doc.id, { description: e.target.value })} placeholder="Brief description of this document's purpose..." rows={2} /></div>
        <div className="flex items-center space-x-2"><Checkbox checked={doc.isRequired} onCheckedChange={(checked) => onUpdateDocument(doc.id, { isRequired: checked as boolean })} className="data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600" /><Label className="text-sm font-normal text-gray-700">This document is required for stage completion</Label></div>

        {(doc.documentType === 'extraction' || doc.documentType === 'both') && (<div className="space-y-4 border-t pt-4 mt-4"><div className="flex justify-between items-center"><div><Label className="text-sm font-semibold text-gray-800">Data Extraction Fields</Label><p className="text-xs text-muted-foreground">{isLinkedDocument ? "Fields from the linked document (read-only)." : "Define what data should be extracted."}</p></div>{!isLinkedDocument && <Button type="button" variant="outline" size="sm" onClick={() => onAddExtraction(doc.id)} className="text-white bg-blue-500 border-blue-300 hover:bg-blue-50"><Plus className="h-4 w-4 mr-2" />Add Field</Button>}</div>{doc.extractionSpecs && doc.extractionSpecs.length > 0 ? (<div className="space-y-3">{doc.extractionSpecs.map((extraction) => (<div key={extraction.id} className={`p-4 rounded-lg border space-y-3 ${isLinkedDocument ? 'bg-blue-50 border-blue-200' : 'bg-slate-100 border-slate-200'}`}><div className="flex justify-between items-center"><span className="font-semibold text-sm">{extraction.fieldName}</span>{!isLinkedDocument && <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive" onClick={() => onRemoveExtraction(doc.id, extraction.id)}><X className="h-3 w-3" /></Button>}</div><p className="text-xs text-muted-foreground">{extraction.description}</p></div>))}</div>) : (<div className="text-center py-6 text-muted-foreground border border-dashed rounded-lg bg-white"><Info className="h-8 w-8 mx-auto mb-2 text-gray-400" /><p className="text-sm">{isLinkedDocument ? "Linked document has no extraction fields." : "No extraction fields defined."}</p></div>)}</div>)}
        <Separator className="my-4" />
        <div className="space-y-4">
          <div className="flex items-start space-x-3">
            <Checkbox id={`doc-automation-${doc.id}`} checked={doc.hasAutomation || false} onCheckedChange={(checked) => onUpdateDocument(doc.id, { hasAutomation: !!checked, ...(!checked && { automationLinks: {} }) })} className="mt-1 data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600" />
            <div>
              <Label htmlFor={`doc-automation-${doc.id}`} className="font-medium flex items-center gap-2 text-gray-800"><Zap className="h-4 w-4 text-blue-600" /> Enable Automation</Label>
              <p className="text-sm text-muted-foreground">Link a specific automation to each target entity for this document.</p>
            </div>
          </div>
          {doc.hasAutomation && (
            <div className="space-y-4 pl-8 border-l-2 border-blue-100 py-4">
              {!doc.isSpecial || !doc.targetEntities || doc.targetEntities.length === 0 ? (
                <div className="bg-amber-50 p-4 rounded-md border border-amber-200 flex gap-2 items-center">
                  <Info className="h-4 w-4 text-amber-600" />
                  <p className="text-xs text-amber-700">Select target entities above to enable per-class automation.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Entity-Specific Automations
                  </Label>
                  {doc.targetEntities.map((entity, index) => {
                    const entityKey = getEntityKey(entity.job_level);

                    const reactKey = `entity-${entityKey}-${index}`;

                    return (
                      <div key={reactKey} className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center p-3 border rounded-lg bg-white shadow-sm">
                        <div className="flex items-center gap-2 overflow-hidden">
                          <div className="bg-slate-100 p-1.5 rounded">
                            {entity.entityType === 'subclass' ? <Layers className="h-3.5 w-3.5 text-orange-600" /> :
                              entity.entityType === 'class' ? <LayoutGrid className="h-3.5 w-3.5 text-blue-600" /> :
                                <FileText className="h-3.5 w-3.5 text-green-600" />}
                          </div>
                          <div className="flex flex-col">
                            <span className="text-sm font-semibold text-gray-800 truncate" title={entity.entityName}>
                              {entity.entityName}
                            </span>
                            <span className="text-[10px] text-gray-400 uppercase font-medium">{entity.entityType}</span>
                          </div>
                        </div>
                        <div>
                          <SearchableSelect
                            options={[
                              { value: 'none', label: 'No automation' },
                              ...(automationTypes?.map(a => ({ value: a.id, label: a.name })))
                            ]}
                            value={entity.automationId || 'none'}
                            onValueChange={(val) => {
                              // We use the index here, which is perfectly safe
                              const updatedEntities = [...doc.targetEntities];
                              updatedEntities[index].automationId = val === 'none' ? null : val;
                              onUpdateDocument(doc.id, { targetEntities: updatedEntities });
                            }}
                            placeholder="Select automation..."
                            className="w-full bg-slate-50"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}