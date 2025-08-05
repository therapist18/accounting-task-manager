// @ts-nocheck
"use client"

import React, { useState, useEffect, useCallback } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Plus, X, Clock, User, FileText, Info, Pencil, MessageSquare, Star, Trash2, Check, Zap, Webhook } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from "@/components/ui/command"
import { supabase } from "@/lib/supabase/client"
import { ComboBox } from "@/components/ui/combobox"
import type { Stage, TimeConfig, StageDocument, DocumentExtraction, EntityOption } from "../types"
import { createKYCDocument, updateKYCDocument } from "../kycDocuments"
import { toast } from "@/hooks/use-toast"

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

const getEntityKey = (entity: any): string | null => {
  if (!entity) return null;
  return `${entity.entityType}-${entity.subdept_id}-${entity.class_id || 'null'}-${entity.subclass_id || 'null'}`;
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
}

export function EditStageDialog({ open, onOpenChange, stage, onSave, departmentName }: EditStageDialogProps) {
  const [formData, setFormData] = useState<Stage | null>(null);
  const [activeTab, setActiveTab] = useState('general');
  const [saving, setSaving] = useState(false);
  const [entityOptions, setEntityOptions] = useState<EntityOption[]>([]);
  const [loadingEntities, setLoadingEntities] = useState(false);
  const [kycDocuments, setKycDocuments] = useState<KYCDocument[]>([]);
  const [loadingKycDocs, setLoadingKycDocs] = useState(false);
  const [automationTypes, setAutomationTypes] = useState<any[]>([]);
  const [loadingAutomations, setLoadingAutomations] = useState(false);

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
    } else {
      setFormData(null);
    }
    setActiveTab('general');
  }, [stage, open, getTargetDepartmentName]);

  const fetchKYCDocuments = async (targetDepartmentName?: string) => {
    setLoadingKycDocs(true);
    try {
      let query = supabase.from('acc_portal_kyc').select('id, name, display_name, department, category, fields, document_type').order('name');
      if (targetDepartmentName) {
        query = query.eq('department', targetDepartmentName);
      }
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

  const fetchEntities = async () => {
    setLoadingEntities(true);
    try {
      const { data: deptsData, error } = await supabase.from('tm_departments').select(`*, tm_subdepartments (*, classes)`);
      if (error) throw error;
      const entities: EntityOption[] = [];
      deptsData?.forEach((dept: any) => {
        if (dept.tm_subdepartments) {
          dept.tm_subdepartments.forEach((subdept: any) => {
            entities.push({ id: subdept.id, name: subdept.name, type: 'subdept', level: 0, subdept_id: subdept.id });
            if (subdept.classes && Array.isArray(subdept.classes)) {
              subdept.classes.forEach((cls: any, clsIndex: number) => {
                const classId = cls.id || `${subdept.id}-class-${clsIndex}`;
                entities.push({ id: classId, name: `${cls.name}`, type: 'class', level: 1, subdept_id: subdept.id, class_id: classId });
                if (cls.subClasses && Array.isArray(cls.subClasses)) {
                  cls.subClasses.forEach((subCls: any, subClsIndex: number) => {
                    const subclassId = subCls.id || `${subdept.id}-class-${clsIndex}-subclass-${subClsIndex}`;
                    entities.push({ id: subclassId, name: `${subCls.name}`, type: 'subclass', level: 2, subdept_id: subdept.id, class_id: classId, subclass_id: subclassId });
                  });
                }
              });
            }
          });
        }
      });
      setEntityOptions(entities);
    } catch (error) {
      console.error('Error fetching entities:', error);
      toast({ title: "Error", description: "Failed to load entities.", variant: "destructive" });
    } finally {
      setLoadingEntities(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData) return;
    const trimmedName = formData.name.trim();
    if (!trimmedName) return;

    setSaving(true);
    try {
      const targetDepartment = getTargetDepartmentName();

     // In the handleSubmit function, modify the docsWithKyc mapping to remove the unwanted fields
const docsWithKyc = await Promise.all(
  (formData.documents || []).map(async (doc) => {
    if (!doc.name?.trim()) return doc;

    const isLinked = !!doc.linkedKycDocument;
    const kycPayload = {
      name: doc.name, 
      fields: doc.extractionSpecs || [], 
      display_name: doc.name,
      department: targetDepartment, 
      category: 'application-docs', 
      document_type: 'one_off',
      metadata: doc.isSpecial ? { isSpecial: true, targetEntities: doc.targetEntities || [] } : undefined
    };

    if (isLinked) {
      // Remove unwanted fields when document is linked
      const { automationId, web_automation, hasWebForm, ...cleanDoc } = doc;
      return cleanDoc;
    } else if (doc.kycId) {
      await updateKYCDocument(doc.kycId, kycPayload);
      const { automationId, web_automation, hasWebForm, ...cleanDoc } = doc;
      return cleanDoc;
    } else {
      const kycId = await createKYCDocument(kycPayload);
      // Don't include the unwanted fields in the new document
      const { automationId, web_automation, hasWebForm, ...restDoc } = doc;
      return { ...restDoc, kycId, linkedKycDocument: kycId };
    }
  })
);
      const updatedStage = {
        ...formData,
        name: trimmedName,
        description: formData.description?.trim() || undefined,
        documents: docsWithKyc.map(({ extractionSpecs, ...doc }) => doc),
        timeConfigs: formData.timeConfigs?.map(tc => ({ ...tc, applicationType: tc.applicationType || 'Default', days: tc.days || 0, hours: tc.hours || 0, minutes: tc.minutes || 0 })) || [],
      };

      await onSave(updatedStage);
      onOpenChange(false);
    } catch (error) {
      console.error('Error saving stage:', error);
      toast({ title: "Error", description: "Failed to save stage.", variant: "destructive" });
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

  if (!formData || !stage) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[95vh] p-0 bg-slate-50 flex flex-col">
        <DialogHeader className="p-6 border-b bg-white sticky top-0 z-10">
          <DialogTitle className="text-xl font-bold text-gray-800 flex items-center gap-3">
            <Pencil className="h-6 w-6 text-blue-600" />
            Edit Stage: {stage.name}
          </DialogTitle>
          <DialogDescription className="text-sm text-gray-500 !mt-1">
            Update the stage details, timing, and required documents.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-6">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-2 bg-slate-200/70 p-1">
              <TabsTrigger value="general" className="data-[state=active]:bg-white data-[state=active]:text-blue-600 data-[state=active]:shadow-sm flex items-center gap-2">
                <Info className="h-4 w-4" />
                General & Timing
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
                <SectionWrapper title="Basic Information" icon={<Pencil />}>
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
                    <Select value={formData.follow_up || 'none'} onValueChange={(value) => setFormData(prev => (prev ? { ...prev, follow_up: value === 'none' ? null : value as 'Client' | 'Officer' | 'BCL' } : null))}>
                      <SelectTrigger><SelectValue placeholder="Select follow up person" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No follow up required</SelectItem>
                        <SelectItem value="Client">Client</SelectItem>
                        <SelectItem value="Officer">Officer</SelectItem>
                        <SelectItem value="BCL">BCL</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormField>
                </SectionWrapper>
              </TabsContent>
              <TabsContent value="documents" className="mt-6 space-y-6">
                <SectionWrapper title="Stage Documents" icon={<FileText />} actionButton={
                  <div className="flex gap-2">
                    <Button onClick={() => addDocument(false)} size="sm" variant="outline" className="text-white bg-blue-600 border-blue-300 hover:bg-blue-50"><Plus className="h-4 w-4 mr-2" />Add Regular</Button>
                    <Button onClick={() => addDocument(true)} size="sm" variant="outline" disabled={!entityOptions.length && !loadingEntities} title={!entityOptions.length ? "Loading entities..." : ""} className="text-white bg-amber-600 border-amber-300 hover:bg-amber-50"><Star className="h-4 w-4 mr-2" />Add Special</Button>
                  </div>
                }>
                  <p className="text-sm text-muted-foreground -mt-2">Define documents for this stage. New documents will be added to the KYC system under the <span className="font-semibold text-blue-700">{getTargetDepartmentName()}</span> department.</p>
                  {(formData.documents || []).length > 0 ? (
                    <div className="space-y-4 pt-4 border-t">
                      {(formData.documents || []).map((doc, index) => (
                        <DocumentCard key={doc.id || index} doc={doc} docIndex={index} entityOptions={entityOptions} loadingEntities={loadingEntities} kycDocuments={kycDocuments} loadingKycDocs={loadingKycDocs} automationTypes={automationTypes} loadingAutomations={loadingAutomations} onUpdateDocument={updateDocument} onRemoveDocument={removeDocument} onAddExtraction={addExtractionField} onUpdateExtraction={updateExtraction} onRemoveExtraction={removeExtraction} />
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
  const toggleEntity = (entity: EntityOption) => {
    const isSelected = selectedEntities.some(selected => getEntityKey(selected) === getEntityKey(entity));
    if (isSelected) {
      onSelectionChange(selectedEntities.filter(selected => getEntityKey(selected) !== getEntityKey(entity)));
    } else {
      const newEntity = { entityType: entity.type, subdept_id: entity.subdept_id!, class_id: entity.class_id, subclass_id: entity.subclass_id, entityName: entity.name.replace(/^→\s*/g, '') };
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
          <Button variant="outline" role="combobox" aria-expanded={open} className="w-full justify-between bg-white" disabled={loading}>
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
            <Badge key={index} variant="secondary" className="flex items-center gap-1 text-xs bg-blue-100 text-blue-800 hover:bg-blue-200">
              {entity.entityName}
              <Badge variant="outline" className="text-xs ml-1 bg-white">{entity.entityType}</Badge>
              <Button variant="ghost" size="icon" className="h-4 w-4 ml-1 p-0 hover:bg-destructive hover:text-destructive-foreground rounded-full" onClick={() => onSelectionChange(selectedEntities.filter((_, i) => i !== index))}>
                <X className="h-3 w-3" />
              </Button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

function DocumentCard({ doc, docIndex, entityOptions, loadingEntities, kycDocuments, loadingKycDocs, automationTypes, loadingAutomations, onUpdateDocument, onRemoveDocument, onAddExtraction, onUpdateExtraction, onRemoveExtraction }: { doc: StageDocument, docIndex: number, entityOptions: EntityOption[], loadingEntities: boolean, kycDocuments: KYCDocument[], loadingKycDocs: boolean, automationTypes: any[], loadingAutomations: boolean, onUpdateDocument: (docId: string, updates: Partial<StageDocument>) => void, onRemoveDocument: (docId: string) => void, onAddExtraction: (docId: string) => void, onUpdateExtraction: (docId: string, extractionId: string, updates: Partial<DocumentExtraction>) => void, onRemoveExtraction: (docId: string, extractionId: string) => void }) {
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
          <Button variant="ghost" size="icon" onClick={() => onRemoveDocument(doc.id)} className="text-muted-foreground hover:text-destructive h-7 w-7"><Trash2 className="h-4 w-4 text-red-500" /></Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6 p-4">
        <div className="space-y-3 p-4 bg-slate-100/70 border border-slate-200 rounded-lg">
          <Label className="font-medium text-gray-700">Document Source</Label>
          <div className="grid grid-cols-2 gap-3">
            <Button variant={documentMode === 'new' ? 'default' : 'outline'} size="sm" onClick={() => handleModeChange('new')} className={`justify-start ${documentMode === 'new' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-white'}`}><Plus className="h-4 w-4 mr-2" />{doc.kycId && !doc.linkedKycDocument ? "Edit as New" : "Create New"}</Button>
            <Button variant={documentMode === 'existing' ? 'default' : 'outline'} size="sm" onClick={() => handleModeChange('existing')} className={`justify-start ${documentMode === 'existing' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-white'}`} disabled={loadingKycDocs}><FileText className="h-4 w-4 mr-2" /> Link Existing</Button>
          </div>
          {documentMode === 'existing' && (<div className="space-y-2 pt-2"><Label className="text-sm text-gray-600">Select Existing Document</Label><ComboBox options={kycDocuments.map(d => ({ value: d.id, label: d.display_name || d.name }))} value={doc.linkedKycDocument || ''} onValueChange={handleKycDocumentSelect} placeholder={loadingKycDocs ? "Loading..." : "Choose a document"} emptyText="No documents found" disabled={loadingKycDocs} loading={loadingKycDocs} className="w-full bg-white" /><p className="text-xs text-green-600 flex items-center gap-1"><Check className="h-3 w-3" /> Document linked. Fields are now read-only.</p></div>)}
        </div>
        {doc.isSpecial && (<div className="space-y-2 p-4 bg-amber-50 border border-amber-300 rounded-lg"><Label className="font-medium flex items-center gap-2 text-amber-800"><Star className="h-4 w-4 text-amber-500" />Target Entities</Label><MultiEntityPicker entities={entityOptions} selectedEntities={doc.targetEntities || []} onSelectionChange={(selectedEntities) => onUpdateDocument(doc.id, { targetEntities: selectedEntities })} loading={loadingEntities} placeholder="Select which entities need this document..." /></div>)}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="space-y-2"><Label className="text-xs font-medium text-gray-700">Document Name *</Label><Input value={doc.name || ''} onChange={(e) => onUpdateDocument(doc.id, { name: e.target.value })} placeholder="e.g., Application Form" disabled={isLinkedDocument} /></div>
          <div className="space-y-2"><Label className="text-xs font-medium text-gray-700">Document Type</Label><Select value={doc.documentType} onValueChange={(value) => onUpdateDocument(doc.id, { documentType: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="upload">Upload Only</SelectItem><SelectItem value="extraction">Data Extraction Only</SelectItem><SelectItem value="both">Upload + Extraction</SelectItem></SelectContent></Select></div>
          <div className="space-y-2"><Label className="text-xs font-medium text-gray-700">Input Type</Label><Select value={doc.inputType || 'file'} onValueChange={(value) => onUpdateDocument(doc.id, { inputType: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="file">File Upload</SelectItem><SelectItem value="message">Message/Text</SelectItem><SelectItem value="both">Both</SelectItem></SelectContent></Select></div>
          <div className="space-y-2"><Label className="text-xs font-medium text-gray-700">Doc Type</Label><Select value={doc.docType || 'normal_doc'} onValueChange={(value: 'form' | 'normal_doc') => onUpdateDocument(doc.id, { docType: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="form">Form</SelectItem><SelectItem value="normal_doc">Normal Doc</SelectItem></SelectContent></Select></div>
        </div>
        <div className="space-y-2"><Label className="text-xs font-medium text-gray-700">Description</Label><Textarea value={doc.description || ''} onChange={(e) => onUpdateDocument(doc.id, { description: e.target.value })} placeholder="Brief description of this document's purpose..." rows={2} /></div>
        <div className="flex items-center space-x-2"><Checkbox checked={doc.isRequired} onCheckedChange={(checked) => onUpdateDocument(doc.id, { isRequired: checked as boolean })} className="data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600" /><Label className="text-sm font-normal text-gray-700">This document is required for stage completion</Label></div>

        {(doc.documentType === 'extraction' || doc.documentType === 'both') && (<div className="space-y-4 border-t pt-4 mt-4"><div className="flex justify-between items-center"><div><Label className="text-sm font-semibold text-gray-800">Data Extraction Fields</Label><p className="text-xs text-muted-foreground">{isLinkedDocument ? "Fields from the linked document (read-only)." : "Define what data should be extracted."}</p></div>{!isLinkedDocument && <Button variant="outline" size="sm" onClick={() => onAddExtraction(doc.id)} className="text-white bg-blue-500 border-blue-300 hover:bg-blue-50"><Plus className="h-4 w-4 mr-2" />Add Field</Button>}</div>{doc.extractionSpecs && doc.extractionSpecs.length > 0 ? (<div className="space-y-3">{doc.extractionSpecs.map((extraction) => (<div key={extraction.id} className={`p-4 rounded-lg border space-y-3 ${isLinkedDocument ? 'bg-blue-50 border-blue-200' : 'bg-slate-100 border-slate-200'}`}><div className="flex justify-between items-center"><span className="font-semibold text-sm">{extraction.fieldName}</span>{!isLinkedDocument && <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive" onClick={() => onRemoveExtraction(doc.id, extraction.id)}><X className="h-3 w-3" /></Button>}</div><p className="text-xs text-muted-foreground">{extraction.description}</p></div>))}</div>) : (<div className="text-center py-6 text-muted-foreground border border-dashed rounded-lg bg-white"><Info className="h-8 w-8 mx-auto mb-2 text-gray-400" /><p className="text-sm">{isLinkedDocument ? "Linked document has no extraction fields." : "No extraction fields defined."}</p></div>)}</div>)}
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
                <div className="text-center py-6 text-muted-foreground border border-dashed rounded-lg bg-white">
                  <Info className="h-8 w-8 mx-auto mb-2 text-gray-400" />
                  <p className="text-sm font-medium">No Target Entities Selected</p>
                  <p className="text-xs">To link automations, first mark this as a 'Special' document and select its target entities above.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  <Label className="font-semibold text-gray-800">Link Automation per Entity</Label>
                  {doc.targetEntities.map((entity) => {
                    const entityKey = getEntityKey(entity);
                    if (!entityKey) return null;
                    return (
                      <div key={entityKey} className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center p-3 border rounded-lg bg-white shadow-sm">
                        <div className="flex items-center gap-2 overflow-hidden">
                          <User className="h-4 w-4 text-slate-500 shrink-0" />
                          <span className="font-medium text-gray-800 truncate" title={entity.entityName}>{entity.entityName}</span>
                          <Badge variant="outline" className="text-xs">{entity.entityType}</Badge>
                        </div>
                        <div>
                          <ComboBox
                            options={[{ value: 'none', label: 'No automation' }, ...(automationTypes?.map(automation => ({ value: automation.id, label: automation.name, icon: <Webhook className="h-4 w-4 text-blue-500 mr-2" /> })) || [])]}
                            value={doc.automationLinks?.[entityKey] || 'none'}
                            onValueChange={(value) => {
                              const newAutomationLinks = { ...(doc.automationLinks || {}) };
                              if (value === 'none') {
                                delete newAutomationLinks[entityKey];
                              } else {
                                newAutomationLinks[entityKey] = value;
                              }
                              onUpdateDocument(doc.id, { automationLinks: newAutomationLinks });
                            }}
                            placeholder="Select an automation"
                            emptyText="No automations found"
                            loading={loadingAutomations}
                            className="w-full bg-white"
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