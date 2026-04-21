// @ts-nocheck
"use client"

import React, { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog"
import { ComboBox } from "@/components/ui/combobox"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Plus, X, Clock, FileText, User, Info, MessageSquare, Trash2, Star, Check, Building2, FolderTree, Zap, Webhook } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { supabase } from "@/lib/supabase/client"
import { DocumentExtraction, Stage, StageDocument, TimeConfig, NewStage, EntityOption, DepartmentOption } from "../stagesdb"
import { createKYCDocument } from "../kycDocuments"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from "@/components/ui/command"
import { toast } from "@/lib/hooks/use-toast"

type DocumentExtraction = any; type Stage = any; type StageDocument = any; type TimeConfig = any; type NewStage = any; type EntityOption = any; type DepartmentOption = any;

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


const generateId = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
});

const getEntityKey = (entity: any): string => {
    if (!entity) return "";
    return `${entity.subdept_id}:${entity.class_id || 0}:${entity.subclass_id || 0}`;
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
    id: string; name: string; display_name: string; department: string;
    category: string; fields: DocumentExtraction[]; document_type: string;
}

interface AddStageDialogProps {
    open: boolean; onOpenChange: (open: boolean) => void;
    onAddStages: (stages: NewStage[], departmentId: string) => Promise<void>;
    departments: DepartmentOption[];
    officers?: any[]; // Officers data for selection
}

interface AutomationType {
    id: string; name: string; description?: string; webhook_url?: string;
    webhook_type?: string; is_active: boolean;
}

export function AddStageDialog({ open, onOpenChange, onAddStages, departments = [], officers = [] }: AddStageDialogProps) {
    const [selectedDepartment, setSelectedDepartment] = useState<string>('');
    const [automationTypes, setAutomationTypes] = useState<AutomationType[]>([]);
    const [loadingAutomations, setLoadingAutomations] = useState(false);
    const [newStages, setNewStages] = useState<NewStage[]>([{
        id: generateId(), name: '', description: '', days: 0, hours: 0, minutes: 0,
        followUp: 'none', officer_id: null, isSpecial: false,
        timeConfigs: [{ applicationType: 'Default', days: 0, hours: 0, minutes: 0 }],
        documents: []
    }]);
    const [saving, setSaving] = useState(false);
    const [activeStageTab, setActiveStageTab] = useState<string>('');
    const [entityOptions, setEntityOptions] = useState<EntityOption[]>([]);
    const [loadingEntities, setLoadingEntities] = useState(false);
    const [kycDocuments, setKycDocuments] = useState<KYCDocument[]>([]);
    const [loadingKycDocs, setLoadingKycDocs] = useState(false);

    useEffect(() => {
        if (newStages.length > 0 && !activeStageTab) {
            setActiveStageTab(newStages[0].id);
        }
    }, [newStages, activeStageTab]);

    useEffect(() => {
        if (selectedDepartment) {
            fetchEntities(selectedDepartment);
            const departmentName = departments.find(d => d.id === selectedDepartment)?.name;
            fetchKYCDocuments(departmentName);
        } else {
            setEntityOptions([]);
            setKycDocuments([]);
        }
    }, [selectedDepartment, departments]);

    const fetchKYCDocuments = async (departmentName?: string) => {
        setLoadingKycDocs(true);
        try {
            let query = supabase.from('acc_portal_kyc').select('id, name, display_name, department, category, fields, document_type').order('name');
            const { data, error } = await query;
            if (error) throw error;
            setKycDocuments((data || []).map(doc => ({ ...doc, fields: transformKycFields(doc.fields) })));
        } catch (error) {
            console.error('Error fetching KYC documents:', error);
            toast({ title: "Error", description: "Failed to load existing documents.", variant: "destructive" });
        } finally {
            setLoadingKycDocs(false);
        }
    };

    const fetchEntities = async (departmentId: string) => {
        setLoadingEntities(true);
        try {
            const { data: deptData, error } = await supabase.from('tm_departments').select(`*, tm_subdepartments (*, classes)`).eq('id', departmentId).single();
            if (error) throw error;
            const entities: EntityOption[] = [];
            deptData?.tm_subdepartments?.forEach((subdept: any) => {
                // Add department_id to every entity level
                entities.push({
                    id: subdept.id, name: subdept.name, type: 'subdept', level: 0, subdept_id: subdept.id,
                    department_id: departmentId // <--- Add this
                });
                subdept.classes?.forEach((cls: any) => {
                    entities.push({ ...cls, type: 'class', level: 1, subdept_id: subdept.id, class_id: cls.id, department_id: departmentId });
                    cls.subClasses?.forEach((subCls: any) => {
                        entities.push({ ...subCls, type: 'subclass', level: 2, subdept_id: subdept.id, class_id: cls.id, subclass_id: subCls.id, department_id: departmentId });
                    });
                });
            });
            setEntityOptions(entities);
        } catch (error) {
            console.error('Error fetching entities:', error);
            toast({ title: "Error", description: "Failed to load entities.", variant: "destructive" });
        } finally {
            setLoadingEntities(false);
        }
    };

    const fetchAutomationTypes = async () => {
        setLoadingAutomations(true);
        try {
            const { data, error } = await supabase.from('tm_automations').select('*').eq('is_active', true).order('name');
            if (error) throw error;
            setAutomationTypes(data || []);
        } catch (error) {
            console.error('Error fetching automation types:', error);
            toast({ title: 'Error', description: 'Failed to load automation types', variant: 'destructive' });
        } finally {
            setLoadingAutomations(false);
        }
    };

    useEffect(() => { if (open) fetchAutomationTypes() }, [open]);

    const addNewStageRow = () => {
        const newStage = { id: generateId(), name: '', description: '', days: 0, hours: 0, minutes: 0, followUp: 'none', isSpecial: false, timeConfigs: [{ applicationType: 'Default', days: 0, hours: 0, minutes: 0 }], documents: [] };
        setNewStages(prev => [...prev, newStage]);
        setActiveStageTab(newStage.id);
    };

    const removeStageRow = (id: string) => {
        if (newStages.length > 1) {
            const updatedStages = newStages.filter(stage => stage.id !== id);
            setNewStages(updatedStages);
            if (activeStageTab === id) setActiveStageTab(updatedStages[0].id);
        }
    };

    const updateNewStage = (id: string, updates: Partial<NewStage>) => {
        setNewStages(prev => prev.map(stage => stage.id === id ? { ...stage, ...updates } : stage));
    };

    const addDocument = (stageId: string, isSpecial: boolean = false) => {
        const newDoc: StageDocument = {
            id: generateId(), name: '', description: '', isRequired: false, documentType: 'both', docType: 'normal_doc',
            inputType: 'file', extractionSpecs: [], isSpecial, linkedKycDocument: undefined,
            ...(isSpecial && { targetEntities: [], automationLinks: {} })
        };
        updateNewStage(stageId, { documents: [...(newStages.find(s => s.id === stageId)?.documents || []), newDoc] });
    };

    const updateDocument = (stageId: string, docId: string, updates: Partial<StageDocument>) => {
        const stage = newStages.find(s => s.id === stageId);
        if (!stage) return;

        const updatedDocs = stage.documents.map(doc => {
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

        updateNewStage(stageId, { documents: updatedDocs });
    };

    const removeDocument = (stageId: string, docId: string) => {
        const stage = newStages.find(s => s.id === stageId);
        if (!stage) return;
        updateNewStage(stageId, { documents: stage.documents.filter(doc => doc.id !== docId) });
    };

    const addExtractionField = (stageId: string, docId: string) => {
        const stage = newStages.find(s => s.id === stageId);
        if (!stage) return;
        const newField: DocumentExtraction = { id: generateId(), fieldName: '', description: '', isRequired: true, fieldType: 'text' };
        const updatedDocs = stage.documents.map(doc => doc.id === docId ? { ...doc, extractionSpecs: [...(doc.extractionSpecs || []), newField] } : doc);
        updateNewStage(stageId, { documents: updatedDocs });
    };

    const updateExtraction = (stageId: string, docId: string, extractionId: string, updates: Partial<DocumentExtraction>) => {
        const stage = newStages.find(s => s.id === stageId);
        if (!stage) return;
        const updatedDocs = stage.documents.map(doc => doc.id === docId ? { ...doc, extractionSpecs: (doc.extractionSpecs || []).map(ext => ext.id === extractionId ? { ...ext, ...updates } : ext) } : doc);
        updateNewStage(stageId, { documents: updatedDocs });
    };

    const removeExtraction = (stageId: string, docId: string, extractionId: string) => {
        const stage = newStages.find(s => s.id === stageId);
        if (!stage) return;
        const updatedDocs = stage.documents.map(doc => doc.id === docId ? { ...doc, extractionSpecs: doc.extractionSpecs?.filter(ext => ext.id !== extractionId) || [] } : doc);
        updateNewStage(stageId, { documents: updatedDocs });
    };

    const handleSubmit = async () => {
        if (!selectedDepartment) return toast({ title: 'Error', description: 'Please select a department', variant: 'destructive' });
        const validStages = newStages.filter(stage => stage.name.trim() !== '');
        if (validStages.length === 0) return toast({ title: 'Error', description: 'Please add at least one stage with a name', variant: 'destructive' });

        setSaving(true);
        try {
            const departmentName = departments.find(d => d.id === selectedDepartment)?.name || selectedDepartment;

            const processedStages = await Promise.all(
                validStages.map(async (stage) => {
                    const processedDocs = await Promise.all(
                        (stage.documents || []).map(async (doc) => {
                            // Handle KYC document creation
                            let currentKycId = doc.linkedKycDocument || doc.kycId;

                            if (!currentKycId && doc.name?.trim()) {
                                currentKycId = await createKYCDocument({
                                    name: doc.name,
                                    department: departmentName,
                                    category: 'application-docs',
                                    document_type: 'one_off',
                                    fields: doc.extractionSpecs || [],
                                    display_name: doc.name,
                                    metadata: {
                                        ...(doc.isSpecial ? { isSpecial: true, targetEntities: doc.targetEntities || [] } : {}),
                                        doc_type: doc.docType || 'normal_doc'
                                    }
                                });
                            }
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
                                linkedKycDocument: currentKycId,
                                hasAutomation: !!doc.hasAutomation,
                                targetEntities: doc.targetEntities || []
                            };
                        })
                    );

                    return { ...stage, documents: processedDocs };
                })
            );

            await onAddStages(processedStages, selectedDepartment);

            // Reset state
            setNewStages([{ id: generateId(), name: '', description: '', isSpecial: false, timeConfigs: [], documents: [] }]);
            setSelectedDepartment('');
            onOpenChange(false);

            toast({ title: "Success", description: "Stages added successfully" });
        } catch (error) {
            console.error('Error adding stages:', error);
            toast({ title: 'Error', description: 'Failed to add stages.', variant: 'destructive' });
        } finally {
            setSaving(false);
        }
    };

    const isFormValid = selectedDepartment && newStages.every(stage => stage.name.trim());
    const currentStage = newStages.find(s => s.id === activeStageTab);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogTrigger asChild><Button size="sm" className="gap-2 bg-blue-600 hover:bg-blue-700"><Plus className="h-4 w-4" />Add Stage</Button></DialogTrigger>
            <DialogContent className="max-w-6xl max-h-[95vh] p-0 bg-slate-50 flex flex-col">
                <DialogHeader className="p-6 border-b bg-white sticky top-0 z-10">
                    <DialogTitle className="text-xl font-bold text-gray-800">Add New Stage(s) ({newStages.length})</DialogTitle>
                    <p className="text-sm text-gray-500">Configure the details, timing, and required documents for the new stage(s).</p>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    <SectionWrapper title="Department Selection" icon={<Building2 />}>
                        <div className="space-y-2">
                            <Label htmlFor="department">Department<span className="text-destructive ml-1">*</span></Label>
                            <Select value={selectedDepartment} onValueChange={setSelectedDepartment}>
                                <SelectTrigger><SelectValue placeholder="Select a department" /></SelectTrigger>
                                <SelectContent>{departments.map((dept) => <SelectItem key={dept.id} value={dept.id}>{dept.name}</SelectItem>)}</SelectContent>
                            </Select>
                            <p className="text-xs text-muted-foreground">Documents will be created under this department in the KYC system.</p>
                        </div>
                    </SectionWrapper>

                    <SectionWrapper title="Stage Configuration" icon={<FolderTree />} actionButton={<Button type="button" variant="outline" onClick={addNewStageRow} className="gap-2 text-blue-600 border-blue-300 hover:bg-blue-50" disabled={saving} size="sm"><Plus className="h-4 w-4" />Add Another Stage</Button>}>
                        {newStages.length > 1 ? (
                            <Tabs value={activeStageTab} onValueChange={setActiveStageTab} className="w-full">
                                <TabsList className="flex w-full overflow-x-auto">
                                    {newStages.map((stage, index) => (
                                        <TabsTrigger key={stage.id} value={stage.id} className="relative data-[state=active]:text-blue-600 data-[state=active]:border-blue-600">
                                            <span className="mr-2">{index + 1}.</span>{stage.name || `Stage ${index + 1}`}
                                            <Button type="button" variant="ghost" size="icon" className="h-4 w-4 ml-2 hover:bg-destructive/20 text-gray-500 hover:text-destructive" onClick={(e) => { e.stopPropagation(); removeStageRow(stage.id); }}><X className="h-3 w-3" /></Button>
                                        </TabsTrigger>
                                    ))}
                                </TabsList>
                                {newStages.map((stage) => (
                                    <TabsContent key={stage.id} value={stage.id} className="space-y-6 mt-6">
                                        <StageForm stage={stage} onUpdate={(updates) => updateNewStage(stage.id, updates)} officers={officers} />
                                        <Separator className="my-6" />
                                        <DocumentsSection
                                            stage={stage} entityOptions={entityOptions} loadingEntities={loadingEntities}
                                            selectedDepartment={selectedDepartment}
                                            kycDocuments={kycDocuments} loadingKycDocs={loadingKycDocs}
                                            automationTypes={automationTypes} loadingAutomations={loadingAutomations}
                                            onAddDocument={(isSpecial) => addDocument(stage.id, isSpecial)}
                                            onUpdateDocument={(docId, updates) => updateDocument(stage.id, docId, updates)}
                                            onRemoveDocument={(docId) => removeDocument(stage.id, docId)}
                                            onAddExtraction={(docId) => addExtractionField(stage.id, docId)}
                                            onUpdateExtraction={(docId, extractionId, updates) => updateExtraction(stage.id, docId, extractionId, updates)}
                                            onRemoveExtraction={(docId, extractionId) => removeExtraction(stage.id, docId, extractionId)}
                                        />
                                    </TabsContent>
                                ))}
                            </Tabs>
                        ) : (
                            currentStage && (
                                <div className="space-y-6">
                                    <StageForm stage={currentStage} onUpdate={(updates) => updateNewStage(currentStage.id, updates)} officers={officers} />
                                    <Separator className="my-6" />
                                    <DocumentsSection
                                        stage={currentStage} entityOptions={entityOptions} loadingEntities={loadingEntities}
                                        selectedDepartment={selectedDepartment}
                                        kycDocuments={kycDocuments} loadingKycDocs={loadingKycDocs}
                                        automationTypes={automationTypes} loadingAutomations={loadingAutomations}
                                        onAddDocument={(isSpecial) => addDocument(currentStage.id, isSpecial)}
                                        onUpdateDocument={(docId, updates) => updateDocument(currentStage.id, docId, updates)}
                                        onRemoveDocument={(docId) => removeDocument(currentStage.id, docId)}
                                        onAddExtraction={(docId) => addExtractionField(currentStage.id, docId)}
                                        onUpdateExtraction={(docId, extractionId, updates) => updateExtraction(currentStage.id, docId, extractionId, updates)}
                                        onRemoveExtraction={(docId, extractionId) => removeExtraction(currentStage.id, docId, extractionId)}
                                    />
                                </div>
                            )
                        )}
                    </SectionWrapper>
                </div>

                <DialogFooter className="p-4 bg-white border-t sticky z-10">
                    <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
                    <Button type="button" onClick={handleSubmit} disabled={!isFormValid || saving} className="bg-blue-600 hover:bg-blue-700">
                        {saving ? <><div className="w-4 h-4 border-2 border-muted border-t-current rounded-full animate-spin mr-2"></div>Adding...</> : <>Add Stage{newStages.length > 1 ? 's' : ''}</>}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function StageForm({ stage, onUpdate, officers }: { stage: NewStage; onUpdate: (updates: Partial<NewStage>) => void; officers?: any[] }) {
    const addTimeConfig = () => onUpdate({ timeConfigs: [...stage.timeConfigs, { applicationType: '', days: 0, hours: 0, minutes: 0 }] });
    const removeTimeConfig = (index: number) => onUpdate({ timeConfigs: stage.timeConfigs.filter((_, i) => i !== index) });
    const updateTimeConfig = (index: number, updates: Partial<TimeConfig>) => {
        const newTimeConfigs = [...stage.timeConfigs];
        newTimeConfigs[index] = { ...newTimeConfigs[index], ...updates };
        onUpdate({ timeConfigs: newTimeConfigs });
    };

    return (
        <div className="space-y-6">
            <div className="grid md:grid-cols-2 gap-5">
                <div className="space-y-2">
                    <Label htmlFor={`name-${stage.id}`}>Stage Name<span className="text-destructive ml-1">*</span></Label>
                    <Input id={`name-${stage.id}`} value={stage.name} onChange={(e) => onUpdate({ name: e.target.value })} placeholder="e.g., Document Review" />
                </div>
                <div className="space-y-2">
                    <Label htmlFor={`description-${stage.id}`}>Description</Label>
                    <Input id={`description-${stage.id}`} value={stage.description || ''} onChange={(e) => onUpdate({ description: e.target.value })} placeholder="Brief description of this stage..." />
                </div>
            </div>
            <div className="space-y-2">
                <Label className="flex items-center gap-2"><User className="h-4 w-4 text-blue-600" />Follow Up With</Label>
                <Select value={stage.followUp} onValueChange={(value) => onUpdate({ followUp: value, officer_ids: value === 'Officer' ? stage.officer_ids : [] })}><SelectTrigger className="max-w-md"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">No follow up</SelectItem><SelectItem value="Client">Client</SelectItem><SelectItem value="Officer">Officer</SelectItem><SelectItem value="BCL">BCL</SelectItem></SelectContent></Select>
            </div>
            {stage.followUp === 'Officer' && (
                <div className="space-y-2">
                    <Label className="flex items-center gap-2"><User className="h-4 w-4 text-blue-600" />Assign Officers</Label>
                    <MultiOfficerPicker officers={officers || []} selectedOfficerIds={stage.officer_ids || []} onSelectionChange={(selectedIds) => onUpdate({ officer_ids: selectedIds })} />
                </div>
            )}
            <div className="space-y-4 pt-4 border-t">
                <div className="flex items-center space-x-3">
                    <Checkbox id={`special-${stage.id}`} checked={stage.isSpecial} onCheckedChange={(checked) => onUpdate({ isSpecial: checked === true })} className="data-[state=checked]:bg-blue-600" />
                    <div><Label htmlFor={`special-${stage.id}`} className="font-medium flex items-center gap-2 text-gray-800"><Clock className="h-4 w-4 text-blue-600" />Variable Time Requirements</Label><p className="text-sm text-muted-foreground">{stage.isSpecial ? 'Set different times by application type.' : 'Set a fixed time for all applications.'}</p></div>
                </div>
                {stage.isSpecial ? (
                    <Card className="shadow-none border-slate-200"><CardHeader className="p-4 bg-slate-50 border-b"><div className="flex justify-between items-center"><CardTitle className="text-sm font-semibold">Time Configurations</CardTitle><Button type="button" variant="outline" size="sm" onClick={addTimeConfig} className="text-blue-600 border-blue-300 hover:bg-blue-50"><Plus className="h-4 w-4 mr-2" />Add Config</Button></div></CardHeader><CardContent className="space-y-4 p-4">{stage.timeConfigs.map((config, index) => <div key={index} className="grid md:grid-cols-6 gap-3 items-end p-3 border rounded-lg bg-slate-50/50"><div className="md:col-span-2"><Label className="text-xs">App Type</Label><Input value={config.applicationType} onChange={(e) => updateTimeConfig(index, { applicationType: e.target.value })} placeholder="e.g., Standard" /></div><div><Label className="text-xs">Days</Label><Input type="number" min="0" value={config.days} onChange={(e) => updateTimeConfig(index, { days: parseInt(e.target.value) || 0 })} /></div><div><Label className="text-xs">Hours</Label><Input type="number" min="0" max="23" value={config.hours} onChange={(e) => updateTimeConfig(index, { hours: parseInt(e.target.value) || 0 })} /></div><div><Label className="text-xs">Minutes</Label><Input type="number" min="0" max="59" value={config.minutes} onChange={(e) => updateTimeConfig(index, { minutes: parseInt(e.target.value) || 0 })} /></div><div><Button type="button" variant="ghost" size="icon" onClick={() => removeTimeConfig(index)} disabled={stage.timeConfigs.length === 1} className="hover:text-destructive"><Trash2 className="h-4 w-4" /></Button></div></div>)}</CardContent></Card>
                ) : (
                    <div className="grid grid-cols-3 gap-3 max-w-md"><div><Label className="text-xs">Days</Label><Input type="number" min="0" value={stage.days} onChange={(e) => onUpdate({ days: parseInt(e.target.value) || 0 })} /></div><div><Label className="text-xs">Hours</Label><Input type="number" min="0" max="23" value={stage.hours} onChange={(e) => onUpdate({ hours: parseInt(e.target.value) || 0 })} /></div><div><Label className="text-xs">Minutes</Label><Input type="number" min="0" max="59" value={stage.minutes} onChange={(e) => onUpdate({ minutes: parseInt(e.target.value) || 0 })} /></div></div>
                )}
            </div>
        </div>
    );
}

function DocumentsSection({ stage, entityOptions, loadingEntities, kycDocuments, loadingKycDocs, automationTypes, loadingAutomations, onAddDocument, onUpdateDocument, onRemoveDocument, onAddExtraction, onUpdateExtraction, onRemoveExtraction }: {
    stage: NewStage; entityOptions: EntityOption[]; loadingEntities: boolean; kycDocuments: KYCDocument[]; loadingKycDocs: boolean;
    automationTypes: AutomationType[]; loadingAutomations: boolean;
    onAddDocument: (isSpecial?: boolean) => void; onUpdateDocument: (docId: string, updates: Partial<StageDocument>) => void; onRemoveDocument: (docId: string) => void;
    onAddExtraction: (docId: string) => void; onUpdateExtraction: (docId: string, extractionId: string, updates: Partial<DocumentExtraction>) => void; onRemoveExtraction: (docId: string, extractionId: string) => void;
}) {
    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div><h4 className="font-semibold flex items-center gap-2 text-gray-800"><FileText className="h-5 w-5 text-blue-600" />Stage Documents ({stage.documents.length})</h4><p className="text-sm text-muted-foreground">Define and configure documents required for this stage.</p></div>
                <div className="flex gap-2"><Button onClick={() => onAddDocument(false)} size="sm" variant="outline" className="text-blue-600 border-blue-300 hover:bg-blue-50"><Plus className="h-4 w-4 mr-2" />Add Regular</Button><Button onClick={() => onAddDocument(true)} size="sm" variant="outline" disabled={!entityOptions.length && !loadingEntities} title={!entityOptions.length ? "Select a department first" : ""} className="text-amber-600 border-amber-300 hover:bg-amber-50"><Star className="h-4 w-4 mr-2" />Add Special</Button></div>
            </div>
            {stage.documents.length > 0 ? (
                <div className="space-y-4">
                    {stage.documents.map((doc, docIndex) => (
                        <DocumentCard
                            key={doc.id} doc={doc} docIndex={docIndex} entityOptions={entityOptions} loadingEntities={loadingEntities}
                            kycDocuments={kycDocuments} loadingKycDocs={loadingKycDocs}
                            automationTypes={automationTypes} loadingAutomations={loadingAutomations}
                            onUpdateDocument={(docId, updates) => onUpdateDocument(docId, updates)}
                            onRemoveDocument={onRemoveDocument}
                            onAddExtraction={onAddExtraction} onUpdateExtraction={onUpdateExtraction} onRemoveExtraction={onRemoveExtraction}
                        />
                    ))}
                </div>
            ) : (<div className="text-center py-8 border-2 border-dashed border-gray-300 rounded-lg bg-white"><FileText className="h-10 w-10 mx-auto mb-3 text-gray-400" /><h4 className="font-medium text-gray-700 mb-1">No documents added yet</h4><p className="text-sm text-muted-foreground">Add documents that are required for this stage.</p></div>)}
        </div>
    );
}

function MultiEntityPicker({ entities, selectedEntities = [], onSelectionChange, loading = false, placeholder = "Select target entities..." }: { entities: EntityOption[], selectedEntities: Array<{ entityType: 'subdept' | 'class' | 'subclass', subdept_id: number, class_id?: string | number, subclass_id?: string | number, entityName: string }>, onSelectionChange: (selectedEntities: any[]) => void, loading?: boolean, placeholder?: string }) {
    const [open, setOpen] = useState(false);
    const toggleEntity = (entity: EntityOption) => {
        const entityKey = getEntityKey(entity);
        // Check against the job_level inside the existing selections
        const isSelected = selectedEntities.some(selected => getEntityKey(selected?.job_level) === entityKey);

        if (isSelected) {
            onSelectionChange(selectedEntities.filter(selected => getEntityKey(selected?.job_level) !== entityKey));
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

function DocumentCard({ doc, docIndex, onUpdateDocument, onRemoveDocument, onAddExtraction, onUpdateExtraction, onRemoveExtraction, kycDocuments, loadingKycDocs, entityOptions, loadingEntities, automationTypes, loadingAutomations }: {
    doc: StageDocument; docIndex: number; onUpdateDocument: (docId: string, updates: Partial<StageDocument>) => void;
    onRemoveDocument: (docId: string) => void; onAddExtraction: (docId: string) => void; onUpdateExtraction: (docId: string, extractionId: string, updates: Partial<DocumentExtraction>) => void;
    onRemoveExtraction: (docId: string, extractionId: string) => void; kycDocuments: KYCDocument[]; loadingKycDocs: boolean;
    entityOptions: EntityOption[]; loadingEntities: boolean; automationTypes: AutomationType[]; loadingAutomations: boolean;
}) {
    const [documentMode, setDocumentMode] = useState<'new' | 'existing'>(doc.linkedKycDocument ? 'existing' : 'new');
    const isLinkedDocument = !!doc.linkedKycDocument;

    const handleKycDocumentSelect = (kycDocId: string) => {
        const selectedKycDoc = kycDocuments.find(d => d.id === kycDocId);
        if (selectedKycDoc) onUpdateDocument(doc.id, { linkedKycDocument: selectedKycDoc.id, kycId: selectedKycDoc.id, name: selectedKycDoc.display_name || selectedKycDoc.name, extractionSpecs: selectedKycDoc.fields || [] });
    };

    return (
        <Card className={`shadow-sm border-slate-200 ${doc.isSpecial ? 'border-amber-300 bg-amber-50/30' : 'bg-white'}`}>
            <CardHeader className="p-4 bg-slate-50/50 border-b"><div className="flex justify-between items-center"><div className="flex items-center gap-3"><h5 className="font-semibold text-sm text-gray-800 flex items-center gap-2">{doc.isSpecial && <Star className="h-4 w-4 text-amber-500" />}Document {docIndex + 1}: {doc.name || 'Untitled'}</h5>{isLinkedDocument && <Badge className="text-xs bg-blue-100 text-blue-800">Linked</Badge>}</div><Button variant="ghost" size="icon" onClick={() => onRemoveDocument(doc.id)} className="text-muted-foreground hover:text-destructive h-7 w-7"><Trash2 className="h-4 w-4" /></Button></div></CardHeader>
            <CardContent className="space-y-6 p-4">
                <div className="space-y-3 p-4 bg-slate-100/70 border border-slate-200 rounded-lg"><Label className="font-medium text-gray-700">Document Source</Label><div className="grid grid-cols-2 gap-3"><Button variant={documentMode === 'new' ? 'default' : 'outline'} size="sm" onClick={() => setDocumentMode('new')} className={`justify-start ${documentMode === 'new' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-white'}`}><Plus className="h-4 w-4 mr-2" />Create New</Button><Button variant={documentMode === 'existing' ? 'default' : 'outline'} size="sm" onClick={() => setDocumentMode('existing')} className={`justify-start ${documentMode === 'existing' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-white'}`} disabled={loadingKycDocs}><FileText className="h-4 w-4 mr-2" />Link Existing</Button></div>{documentMode === 'existing' && <div className="space-y-2 pt-2"><Label className="text-sm text-gray-600">Select Existing Document</Label><ComboBox options={kycDocuments.map(d => ({ value: d.id, label: d.display_name || d.name }))} value={doc.linkedKycDocument || ''} onValueChange={handleKycDocumentSelect} placeholder={loadingKycDocs ? "Loading..." : "Choose a document"} emptyText="No documents found" disabled={loadingKycDocs} loading={loadingKycDocs} className="w-full bg-white" />{isLinkedDocument && <p className="text-xs text-green-600 flex items-center gap-1"><Check className="h-3 w-3" />Document linked.</p>}</div>}</div>
                {doc.isSpecial && <div className="space-y-2 p-4 bg-amber-50 border border-amber-300 rounded-lg"><Label className="font-medium flex items-center gap-2 text-amber-800"><Star className="h-4 w-4 text-amber-500" />Target Entities</Label><MultiEntityPicker entities={entityOptions} selectedEntities={doc.targetEntities || []} onSelectionChange={(selected) => onUpdateDocument(doc.id, { targetEntities: selected })} loading={loadingEntities} /></div>}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4"><div className="space-y-2"><Label>Name *</Label><Input value={doc.name || ''} onChange={(e) => onUpdateDocument(doc.id, { name: e.target.value })} disabled={isLinkedDocument} /></div><div className="space-y-2"><Label>Doc Type</Label><Select value={doc.documentType} onValueChange={(v) => onUpdateDocument(doc.id, { documentType: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="upload">Upload</SelectItem><SelectItem value="extraction">Extraction</SelectItem><SelectItem value="both">Both</SelectItem></SelectContent></Select></div><div className="space-y-2"><Label>Input Type</Label><Select value={doc.inputType || 'file'} onValueChange={(v) => onUpdateDocument(doc.id, { inputType: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="file">File</SelectItem><SelectItem value="message">Message</SelectItem><SelectItem value="both">Both</SelectItem></SelectContent></Select></div><div className="space-y-2"><Label>System Type</Label><Select value={doc.docType || 'normal_doc'} onValueChange={(v) => onUpdateDocument(doc.id, { docType: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="form">Form</SelectItem><SelectItem value="normal_doc">Normal Doc</SelectItem></SelectContent></Select></div></div>
                <div className="space-y-2"><Label>Description</Label><Textarea value={doc.description || ''} onChange={(e) => onUpdateDocument(doc.id, { description: e.target.value })} rows={2} /></div>
                <div className="flex items-center space-x-2"><Checkbox checked={doc.isRequired} onCheckedChange={(c) => onUpdateDocument(doc.id, { isRequired: !!c })} /><Label>This document is required</Label></div>

                <Separator className="my-4" />
                <div className="space-y-4">
                    <div className="flex items-start space-x-3">
                        <Checkbox id={`doc-automation-${doc.id}`} checked={doc.hasAutomation || false} onCheckedChange={(c) => onUpdateDocument(doc.id, { hasAutomation: !!c, ...(!c && { automationLinks: {} }) })} className="mt-1 data-[state=checked]:bg-blue-600" />
                        <div>
                            <Label htmlFor={`doc-automation-${doc.id}`} className="font-medium flex items-center gap-2"><Zap className="h-4 w-4 text-blue-600" /> Enable Automation</Label>
                            <p className="text-sm text-muted-foreground">Link a specific automation to each target entity for this document.</p>
                        </div>
                    </div>
                    {doc.hasAutomation && (
                        <div className="space-y-4 pl-8 border-l-2 border-blue-100 py-4">
                            {!doc.isSpecial || !doc.targetEntities || doc.targetEntities.length === 0 ? (
                                <div className="text-center py-6 text-muted-foreground border border-dashed rounded-lg bg-white">
                                    <Info className="h-8 w-8 mx-auto mb-2 text-gray-400" />
                                    <p className="text-sm font-medium">No Target Entities Selected</p>
                                    <p className="text-xs">Select entities above to link automations to them.</p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    <Label className="font-semibold text-gray-800">Entity-Specific Automations</Label>
                                    {doc.targetEntities.map((entity, index) => (
                                        <div key={index} className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center p-3 border rounded-lg bg-white shadow-sm">
                                            <div className="flex items-center gap-2 overflow-hidden">
                                                <div className="bg-slate-100 p-1.5 rounded">
                                                    {entity.entityType === 'subclass' ? <Layers className="h-3.5 w-3.5 text-orange-600" /> :
                                                        entity.entityType === 'class' ? <LayoutGrid className="h-3.5 w-3.5 text-blue-600" /> :
                                                            <FileText className="h-3.5 w-3.5 text-green-600" />}
                                                </div>
                                                <div className="flex flex-col">
                                                    <span className="text-sm font-semibold text-gray-800 truncate">{entity.entityName}</span>
                                                    <span className="text-[10px] text-gray-400 uppercase font-medium">{entity.entityType}</span>
                                                </div>
                                            </div>
                                            <div>
                                                <ComboBox
                                                    options={[
                                                        { value: 'none', label: 'No automation' },
                                                        ...(automationTypes?.map(a => ({
                                                            value: a.id,
                                                            label: a.name,
                                                            icon: <Webhook className="h-4 w-4 text-blue-500 mr-2" />
                                                        })) || [])
                                                    ]}
                                                    value={entity.automationId || 'none'}
                                                    onValueChange={(val) => {
                                                        const updatedEntities = [...doc.targetEntities];
                                                        if (val === 'none') {
                                                            updatedEntities[index].automationId = null;
                                                        } else {
                                                            updatedEntities[index].automationId = val;
                                                            updatedEntities[index].job_level = {
                                                                department_id: selectedDepartment,
                                                                subdepartment_id: entity.subdept_id || entity.job_level?.subdepartment_id,
                                                                class_id: entity.class_id || entity.job_level?.class_id || null,
                                                                subclass_id: entity.subclass_id || entity.job_level?.subclass_id || null,
                                                                level: (entity.subclass_id || entity.job_level?.subclass_id) ? 4 :
                                                                    (entity.class_id || entity.job_level?.class_id) ? 3 : 2
                                                            };
                                                        }
                                                        onUpdateDocument(doc.id, { targetEntities: updatedEntities });
                                                    }}
                                                    placeholder="Select automation..."
                                                    className="w-full bg-white"
                                                />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {(doc.documentType === 'extraction' || doc.documentType === 'both') && <div className="space-y-4 border-t pt-4 mt-4"><div className="flex justify-between items-center"><div><Label className="text-sm font-semibold">Data Extraction Fields</Label><p className="text-xs text-muted-foreground">{isLinkedDocument ? "Fields from linked document (read-only)." : "Define data to be extracted."}</p></div>{!isLinkedDocument && <Button variant="outline" size="sm" onClick={() => onAddExtraction(doc.id)}><Plus className="h-4 w-4 mr-2" />Add Field</Button>}</div>{doc.extractionSpecs && doc.extractionSpecs.length > 0 ? <div className="space-y-3">{doc.extractionSpecs.map((ext) => <div key={ext.id} className={`p-3 rounded-lg border ${isLinkedDocument ? 'bg-blue-50' : 'bg-slate-100'}`}><div className="flex justify-between items-center"><span className="font-semibold text-sm">{ext.fieldName}</span>{!isLinkedDocument && <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onRemoveExtraction(doc.id, ext.id)}><X className="h-3 w-3" /></Button>}</div><p className="text-xs text-muted-foreground">{ext.description}</p></div>)}</div> : <div className="text-center py-6 text-muted-foreground border-dashed border rounded-lg"><Info className="h-8 w-8 mx-auto mb-2" /><p className="text-sm">No extraction fields defined.</p></div>}</div>}
            </CardContent>
        </Card>
    );
}