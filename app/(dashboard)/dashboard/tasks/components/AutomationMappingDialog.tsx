// @ts-nocheck
"use client"

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Loader2, Zap, User, Database, FileText, Settings, Webhook, ChevronRight, AlertCircle, CheckCircle2, Edit3, X, Save, Calculator, FunctionSquare, ExternalLink, Paperclip, AlertTriangle, ArrowUpDown, Filter, Check, List, ChevronDown, HelpCircle, Eye, Download, Lock } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from '@/lib/hooks/use-toast';
import supabase from '@/lib/supabase/client';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { processComputedFields, executeComputedField } from '../utils/automationComputedFunctions';
import { SearchableSelect } from "@/components/ui/searchable-select";
import { ExtractionPreview } from "@/components/ExtractionPreview"
import { ENTITY_TYPES, type EntityType } from "@/lib/constants/entity-types";
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { isValidValue, ETA_SCREENSHOT_DOCUMENT_ID, cleanFieldValue, updateJsonValue } from '../utils/AutomationMappingDialog';
import { resolveTargetEntityIdImpl, resolveVariableValueImpl, getFieldValueImpl, getArrayFieldDataImpl, fetchSourceDataImpl, type FieldResolutionContext } from '../utils/fieldResolution';
import { AutomationMappingDialogUI } from './AutomationMappingDialogUI';
import { useCurrentUser } from "@/lib/hooks/use-current-user";
import { auditActor } from "../utils/audit";

interface AutomationMappingDialogProps {
  isOpen: boolean;
  onClose: () => void;
  classId: string;
  requirementId: string;
  taskId?: string;
  automationId?: string;
  isSubclass?: boolean;
  subDeptId?: string;
  subclassId?: string;
  task?: any;
  individualId?: string;
  stageDocuments?: any[];
  allDocuments?: any[];
  stage?: any;
  relationshipData?: any;
  refreshDocuments?: () => void;
  enhancedTasksData?: Map<string, any>;
}

interface EntityAutomationMapping {
  entityKey: string;
  entityName: string;
  entityType: string;
  automationId: string;
  documentId?: string;
  automation?: any;
}

const ENTITY_TYPE_COLORS: Record<string, string> = {
  principal: 'bg-blue-100 text-blue-700 border-blue-200',
  dependant: 'bg-purple-100 text-purple-700 border-purple-200',
  sponsor: 'bg-amber-100 text-amber-700 border-amber-200',
  director: 'bg-green-100 text-green-700 border-green-200',
  company: 'bg-slate-100 text-slate-700 border-slate-200',
  understudy: 'bg-teal-100 text-teal-700 border-teal-200',
};

export const AutomationMappingDialog = ({ isOpen, onClose, classId, taskId, task, individualId, allDocuments = [], stage, relationshipData, refreshDocuments, enhancedTasksData = new Map() }: AutomationMappingDialogProps) => {
  const [isLoading, setIsLoading] = useState(false);
  const [isAutomationRunning, setIsAutomationRunning] = useState(false);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [isLoadingDocuments, setIsLoadingDocuments] = useState(false);
  const [webData, setWebData] = useState<any[]>([]);
  const [jobFields, setJobFields] = useState<Record<string, any>>({});
  const [documentFiles, setDocumentFiles] = useState<any[]>([]);
  const [entityAutomationMappings, setEntityAutomationMappings] = useState<EntityAutomationMapping[]>([]);
  const [selectedAutomationId, setSelectedAutomationId] = useState<string>('');
  const [editingCell, setEditingCell] = useState<any>(null);
  const [editValue, setEditValue] = useState('');
  const [activeTab, setActiveTab] = useState('fields');
  const [currentIndividualId, setCurrentIndividualId] = useState(individualId || task?.individual_id?.toString() || '');
  const [computedFieldsPreview, setComputedFieldsPreview] = useState<Record<string, string>>({});
  const [isComputing, setIsComputing] = useState(false);
  const [sourceData, setSourceData] = useState<Record<string, Record<string, any>>>({});
  const [masterFieldComputedValues, setMasterFieldComputedValues] = useState<Record<string, any>>({});
  const [sortMissingFirst, setSortMissingFirst] = useState(false);
  const [entitySort, setEntitySort] = useState<'asc' | 'desc' | null>(null);
  const [expandedArrayFields, setExpandedArrayFields] = useState<Set<string>>(new Set());
  const [expandedSourceFields, setExpandedSourceFields] = useState<Set<string>>(new Set());
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [previewingDocuments, setPreviewingDocuments] = useState<any>(null);
  const lastFetchKey = React.useRef<string>('');
  const isFetchingRef = React.useRef(false);
  const logsEndRef = React.useRef<HTMLDivElement>(null);
  const [requirementJobQuestions, setRequirementJobQuestions] = useState<any[]>([]);
  const [individualName, setIndividualName] = useState<string>('');
  const [savedScreenshotDoc, setSavedScreenshotDoc] = useState<any>(null);
  const [isSavingScreenshot, setIsSavingScreenshot] = useState(false);
  const [automationJobId, setAutomationJobId] = useState<string | null>(null);
  const [automationProgress, setAutomationProgress] = useState<any>(null);
  const [pollingInterval, setPollingInterval] = useState<NodeJS.Timeout | null>(null);
  const { user: currentUser } = useCurrentUser();
  const actor = auditActor(currentUser);

  const saveScreenshotToSupabase = async (base64Screenshot: string, directorId: string): Promise<any> => {
    setIsSavingScreenshot(true);
    try {
      const byteCharacters = atob(base64Screenshot);
      const byteNumbers = new Array(byteCharacters.length).fill(0).map((_, i) => byteCharacters.charCodeAt(i));
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: 'image/png' });
      const timestamp = Date.now();
      const fileName = `eta - kenya - confirmation - ${timestamp}.png`;
      const storagePath = `individual - documents / ${directorId} /${ETA_SCREENSHOT_DOCUMENT_ID}/${fileName} `;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('kyc-documents')
        .upload(storagePath, blob, {
          contentType: 'image/png',
          upsert: false,
        });
      if (uploadError) throw new Error(`Storage upload failed: ${uploadError.message} `);
      const { data: docRecord, error: insertError } = await supabase
        .from('acc_portal_directors_documents')
        .insert({
          director_id: directorId,
          document_id: ETA_SCREENSHOT_DOCUMENT_ID,
          file_path: storagePath,
          file_name: fileName,
          status: 'active',
          extraction_status: 'success',
          extracted_details: {
            source: 'eta-kenya-automation',
            captured_at: new Date().toISOString(),
            task_id: taskId,
          },
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          uploaded_by: {
            user_id: actor.by_id,
            uploaded_at: new Date().toISOString(),
          },
        })
        .select()
        .single();
      if (insertError) throw new Error(`DB insert failed: ${insertError.message} `);
      console.log('✅ Screenshot saved to Supabase:', docRecord);
      return docRecord;
    } finally {
      setIsSavingScreenshot(false);
    }
  };

  const deriveAutomationType = useCallback((automation: any): string => {
    if (automation?.automation_type) return automation.automation_type;
    const url = automation?.webhook_url || '';
    const parts = url.split('/').filter(Boolean);
    const last = parts[parts.length - 1];
    if (last && !last.includes('localhost') && !last.includes('http')) return last;
    const secondLast = parts[parts.length - 2];
    if (secondLast && secondLast !== 'permit' && !secondLast.includes(':')) return secondLast;
    return 'class-d';
  }, []);

  const getEntityNameAndId = useCallback((entityType?: string, entityId?: string) => {
    const targetId = entityId;
    if (!entityType && !targetId) return { name: 'Not specified', id: 'Not specified' };
    const type = entityType?.toLowerCase();
    if (type === 'company') {
      return {
        name: relationshipData?.company?.company_name || task?.company_name || 'Not specified',
        id: String(relationshipData?.company?.id || task?.company_id || 'Not specified')
      };
    }
    const allPeople = [
      ...(relationshipData?.directors || []),
      ...(relationshipData?.dependants || []),
      relationshipData?.understudy,
      relationshipData?.sponsor,
      relationshipData?.principal
    ].filter(Boolean);
    const person = allPeople.find(p => String(p.id) === String(targetId));
    if (person) {
      return {
        name: person.full_name || person.name || (person.first_name ? `${person.first_name} ${person.last_name || ''}` : 'Not specified'),
        id: String(person.id)
      };
    }
    return {
      name: 'Not specified',
      id: 'Not specified'
    };
  }, [relationshipData, task]);

  const getPrimaryEntityType = useCallback(() => {
    const activeAutomation = webData.find(w => w.automationId === selectedAutomationId);
    if (!activeAutomation?.fields) return 'principal';
    const entityTypes = new Set<string>();
    activeAutomation.fields.forEach((field: any) => { if (field.entityTypes && field.entityTypes.length > 0) field.entityTypes.forEach((type: string) => entityTypes.add(type)); });
    const priorityOrder = ['company', 'director', 'understudy', 'sponsor', 'dependant', 'principal'];
    for (const type of priorityOrder) {
      if (entityTypes.has(type)) return type;
    }
    return 'principal';
  }, [webData, selectedAutomationId]);

  const getPrimaryTargetEntityId = useCallback((): string => {
    const primaryEntityType = getPrimaryEntityType();
    const entityInfo = getEntityNameAndId(primaryEntityType);
    return entityInfo.id !== 'Not specified'
      ? entityInfo.id
      : (task?.applicant_details?.id || '');
  }, [getPrimaryEntityType, getEntityNameAndId, task]);

  const handleCompletedJob = useCallback(async (job: any) => {
    const directorId = getPrimaryTargetEntityId();
    const evidence = job.evidence || [];
    const screenshots = evidence.filter((e: any) => e.type === 'screenshot');

    if (screenshots.length > 0 && directorId && directorId !== 'N/A') {
      let lastSavedDoc = null;
      for (const screenshot of screenshots) {
        try {
          const resp = await fetch(screenshot.url);
          const blob = await resp.blob();
          const base64 = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => {
              const result = reader.result?.toString().split(',')[1] || '';
              resolve(result);
            };
            reader.readAsDataURL(blob);
          });
          const savedDoc = await saveScreenshotToSupabase(base64, directorId);
          lastSavedDoc = savedDoc;
        } catch (err) {
          console.error('Failed to save evidence screenshot:', err);
        }
      }

      if (lastSavedDoc) {
        setSavedScreenshotDoc(lastSavedDoc);
        setPreviewingDocuments({
          document_display_name: 'Automation Screenshot',
          documents: [lastSavedDoc],
          person_full_name: individualName || directorId,
          requirementId: ETA_SCREENSHOT_DOCUMENT_ID,
        });
        setShowPreviewModal(true);
        if (refreshDocuments) refreshDocuments();

        toast({
          title: '✅ Automation Completed!',
          description: 'Screenshot saved and ready for review.',
        });
        return;
      }
    }

    toast({
      title: '✅ Automation Completed!',
      description: job.message || job.result?.message || 'Automation completed successfully.',
    });
  }, [getPrimaryTargetEntityId, individualName, refreshDocuments, saveScreenshotToSupabase]);

  const clearPolling = useCallback(() => {
    setPollingInterval(prev => {
      if (prev) clearInterval(prev);
      return null;
    });
  }, []);

  const pollSupabaseJob = useCallback(async (jobId: string) => {
    try {
      const { data: job, error } = await supabase
        .from('automation_jobs')
        .select('*')
        .eq('id', jobId)
        .single();

      if (error || !job) {
        console.log('Job not found - stopping polling');
        clearPolling();
        setIsAutomationRunning(false);
        return;
      }

      setAutomationProgress({
        isRunning: job.status === 'pending' || job.status === 'claiming' || job.status === 'running',
        progress: job.progress || 0,
        currentStep: job.current_step || '',
        message: job.message || '',
        logs: job.logs || [],
        evidence: job.evidence || [],
        status: job.status,
      });

      if (job.status === 'completed') {
        clearPolling();
        setIsAutomationRunning(false);
        await handleCompletedJob(job);
      } else if (job.status === 'failed') {
        clearPolling();
        setIsAutomationRunning(false);
        toast({
          title: '❌ Automation Failed',
          description: job.error || 'Unknown error',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Error polling job:', error);
    }
  }, [handleCompletedJob, clearPolling]);

  const stopAutomation = useCallback(async () => {
    if (!automationJobId) return;
    await supabase.from('automation_jobs').update({
      status: 'failed',
      error: 'Cancelled by user',
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      cancelled_by_id: actor.by_id,
    }).eq('id', automationJobId);
    clearPolling();
    setIsAutomationRunning(false);
    setAutomationProgress(prev => prev ? { ...prev, isRunning: false, message: 'Stopped by user' } : prev);
  }, [automationJobId, clearPolling, currentUser]);

  useEffect(() => {
    return () => {
      if (pollingInterval) {
        clearInterval(pollingInterval);
      }
    };
  }, [pollingInterval]);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [automationProgress?.logs?.length]);

  const getFileUrl = (filePath: string) => {
    if (!filePath) return '';
    if (filePath.startsWith('http')) return filePath;
    const bucketName = 'kyc-documents';
    let cleanPath = filePath;
    if (cleanPath.startsWith(bucketName + '/')) {
      cleanPath = cleanPath.substring(bucketName.length + 1);
    }
    const fullPath = `${bucketName}/${cleanPath}`;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!supabaseUrl) {
      console.error('NEXT_PUBLIC_SUPABASE_URL environment variable is not set');
      return '';
    }
    const encodedPath = encodeURIComponent(fullPath).replace(/%2F/g, '/');
    return `${supabaseUrl}/storage/v1/object/public/${encodedPath}`;
  };

  const handlePreviewDocument = async (doc: any) => {
    if (!doc) return;
    setPreviewingDocuments({
      document_display_name: doc.file_name || 'Document',
      documents: [doc],
      person_full_name: relationshipData?.principal?.full_name || 'Unknown',
      requirementId: doc.requirement_id || 'Unknown'
    });
    setShowPreviewModal(true);
  };

  const handlePreviewDataChange = useCallback((docId: string, fieldName: string, value: any) => {
    if (!previewingDocuments) return;
    const updatedDocuments = previewingDocuments.documents.map((doc: any) => {
      if (doc.id === docId || doc.id === `doc - ${docId}` || doc.file_path === docId) {
        return {
          ...doc,
          edited_details: {
            ...doc.edited_details,
            [fieldName]: value
          }
        };
      }
      return doc;
    });

    setPreviewingDocuments({
      ...previewingDocuments,
      documents: updatedDocuments
    });
  }, [previewingDocuments]);

  const handleSaveEditedDocument = async (doc: any, editedData: Record<string, any>) => {
    try {
      const { error } = await supabase
        .from('acc_portal_directors_documents')
        .update({
          edited_details: editedData,
          updated_at: new Date().toISOString(),
          updated_by_id: actor.by_id,
          edited_by: actor.by_id,
        })
        .eq('id', doc.id);
      if (error) throw error;
      toast.success('Document details updated successfully');
      const updatedDocuments = previewingDocuments.documents.map((d: any) =>
        d.id === doc.id ? { ...d, edited_details } : d
      );
      setPreviewingDocuments({
        ...previewingDocuments,
        documents: updatedDocuments
      });
      if (refreshDocuments) {
        refreshDocuments();
      }
    } catch (error) {
      console.error('Error saving document details:', error);
      toast.error('Failed to save document details');
    }
  };

  const buildFileUrl = (linkedDoc: any): string | null => {
    if (!linkedDoc?.file_path) return null;
    if (linkedDoc.file_path.startsWith('http')) return linkedDoc.file_path;
    const bucketName = 'kyc-documents';
    let filePath = linkedDoc.file_path;
    if (filePath.startsWith(bucketName + '/')) {
      filePath = filePath.substring(bucketName.length + 1);
    }
    const fullPath = `${bucketName}/${filePath}`;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!supabaseUrl) {
      console.error('NEXT_PUBLIC_SUPABASE_URL environment variable is not set');
      return null;
    }
    const encodedPath = encodeURIComponent(fullPath).replace(/%2F/g, '/');
    return `${supabaseUrl}/storage/v1/object/public/${encodedPath}`;
  };

  const currentEntityType = useMemo(() => {
    if (!currentIndividualId) return 'principal';
    if (relationshipData?.dependants?.some((d: any) => String(d.id) === String(currentIndividualId))) {
      return 'dependant';
    }
    if (relationshipData?.directors?.some((d: any) => String(d.id) === String(currentIndividualId))) {
      return 'director';
    }
    if (String(relationshipData?.sponsor?.id) === String(currentIndividualId)) {
      return 'sponsor';
    }
    if (String(relationshipData?.understudy?.id) === String(currentIndividualId)) {
      return 'understudy';
    }
    if (String(relationshipData?.principal?.id) === String(currentIndividualId)) {
      return 'principal';
    }
    return 'principal';
  }, [currentIndividualId, relationshipData]);

  const resolveTargetEntityId = useCallback((field: any) =>
    resolveTargetEntityIdImpl(field, { relationshipData, currentIndividualId, task } as FieldResolutionContext),
    [relationshipData, currentIndividualId, task]);

  const toggleArrayFieldExpansion = (fieldVariableName: string) => setExpandedArrayFields(prev => { const newSet = new Set(prev); if (newSet.has(fieldVariableName)) newSet.delete(fieldVariableName); else newSet.add(fieldVariableName); return newSet; });
  const toggleSourceFieldExpansion = (fieldId: string) => setExpandedSourceFields(prev => { const newSet = new Set(prev); if (newSet.has(fieldId)) newSet.delete(fieldId); else newSet.add(fieldId); return newSet; });

  const buildFieldResolutionContext = useCallback((): FieldResolutionContext => ({
    sourceData, jobFields, webData, selectedAutomationId, masterFieldComputedValues,
    relationshipData, taskId, currentIndividualId, task, isLoading, isLoadingData
  }), [sourceData, jobFields, webData, selectedAutomationId, masterFieldComputedValues, relationshipData, taskId, currentIndividualId, task, isLoading, isLoadingData]);

  const resolveVariableValue = useCallback((fieldDef: any, targetEntityId: string) =>
    resolveVariableValueImpl(fieldDef, targetEntityId, buildFieldResolutionContext()),
    [buildFieldResolutionContext]);

  const getArrayFieldData = (field: any) => getArrayFieldDataImpl(field, buildFieldResolutionContext());

  const getMasterFieldDisplayName = (masterFieldId: string | number, itemName?: string) => {
    if (itemName) return itemName;
    const fieldIdStr = String(masterFieldId);
    const masterField = jobFields[fieldIdStr];
    if (masterField) return masterField.label || masterField.field_key || masterField.table_header || fieldIdStr;
    const activeWebEntry = webData.find(w => w.automationId === selectedAutomationId);
    if (activeWebEntry?.fields) { const field = activeWebEntry.fields.find((f: any) => { const linkedFields = f.linkedMasterFields || f.masterFieldIds || []; return linkedFields.some((id: any) => String(id) === fieldIdStr) || f.variableName === fieldIdStr; }); if (field) return field.efnsDisplayName || field.variableName || fieldIdStr; }
    for (const [key, field] of Object.entries(jobFields)) { const linkedFields = field.linkedMasterFields || field.masterFieldIds || []; if (linkedFields.some((id: any) => String(id) === fieldIdStr)) return field.label || field.field_key || field.table_header || key; }
    return fieldIdStr;
  };

  const fetchSourceData = useCallback(async () => {
    if (!isOpen || !selectedAutomationId || Object.keys(jobFields).length === 0 || !webData.length) return;
    const fetchKey = `${selectedAutomationId} - ${Object.keys(jobFields).length} - ${webData.length} - ${Date.now()}`;
    if (isFetchingRef.current) return;
    lastFetchKey.current = fetchKey;
    isFetchingRef.current = true;
    setIsLoadingData(true);
    try {
      const { sourceData: newSourceData, masterFieldComputedValues: newComputedValues } = await fetchSourceDataImpl({
        selectedAutomationId, webData, jobFields, relationshipData, taskId, currentIndividualId, task
      });
      if (newComputedValues !== null) {
        setMasterFieldComputedValues(newComputedValues);
      }
      setSourceData(newSourceData);
    } catch (error) { console.error("Fetch Error:", error); } finally { isFetchingRef.current = false; setIsLoadingData(false); }
  }, [jobFields, selectedAutomationId, webData, resolveTargetEntityId, relationshipData, isOpen, taskId, currentIndividualId, task]);

  const getFieldValue = (fieldIdOrVariable: string, entityId: string, sourceIdx: number = 0, extractionMode: string = 'latest', preserveArray: boolean = false) =>
    getFieldValueImpl(fieldIdOrVariable, entityId, sourceIdx, extractionMode, preserveArray, buildFieldResolutionContext());

  const fetchDocumentFiles = useCallback(async () => {
    if (!isOpen || !selectedAutomationId || !webData.length || isLoadingDocuments) return;
    setIsLoadingDocuments(true);
    const activeAutomation = webData.find(w => w.automationId === selectedAutomationId);
    if (!activeAutomation) { setIsLoadingDocuments(false); return; }

    // Collect all document fields: normal fields + array item fields
    const normalDocFields = activeAutomation.fields?.filter((f: any) => f.fieldType === 'document') || [];
    const arrayDocFields = activeAutomation.fields?.filter((f: any) => f.fieldType === 'array')
      ?.flatMap((field: any) => {
        return (field.arrayItems || [])
          .filter((colItem: any) => colItem.type === 'document')
          .map((colItem: any) => ({
            ...colItem,
            entityTypes: colItem.entityTypes || field.entityTypes,
            linkedKycDocuments: colItem.linkedKycDocuments || []
          }));
      }) || [];

    const allDocFields = [...normalDocFields, ...arrayDocFields];

    const personIds = new Set<string>();
    const companyIds = new Set<string>();
    const requiredKycIds = new Set<string>();

    allDocFields.forEach((field: any) => {
      const entityId = resolveTargetEntityId(field);
      if (entityId) {
        if (field.entityTypes?.includes('company')) companyIds.add(String(entityId));
        else personIds.add(String(entityId));
        // Handle linkedKycDocuments array
        if (field.linkedKycDocuments && Array.isArray(field.linkedKycDocuments)) {
          field.linkedKycDocuments.forEach((docId: string) => requiredKycIds.add(docId));
        }
      }
    });

    try {
      const results = [];
      if (personIds.size > 0 && requiredKycIds.size > 0) {
        const { data: personDocs } = await supabase.from('acc_portal_directors_documents').select('*, kyc_document:acc_portal_kyc!document_id(*)').in('director_id', Array.from(personIds)).in('document_id', Array.from(requiredKycIds)).neq('status', 'deleted');
        if (personDocs) results.push(...personDocs.map(d => ({ ...d, owner_type: 'person', owner_id: String(d.director_id) })));
      }
      if (companyIds.size > 0 && requiredKycIds.size > 0) {
        const { data: companyDocs } = await supabase.from('acc_portal_company_documents').select('*, kyc_document:acc_portal_kyc!document_id(*)').in('company_id', Array.from(companyIds)).in('document_id', Array.from(requiredKycIds)).neq('status', 'deleted');
        if (companyDocs) results.push(...companyDocs.map(d => ({ ...d, owner_type: 'company', owner_id: String(d.company_id) })));
      }
      setDocumentFiles(results);
    } catch (err) {
      console.error("Error fetching documents:", err);
    } finally {
      setIsLoadingDocuments(false);
    }
  }, [selectedAutomationId, webData, resolveTargetEntityId, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const fetchData = async () => {
      setIsLoading(true);
      try {
        const jl = task?.job_level;
        if (!jl) return;
        let query = supabase.from('tm_class_requirements').select('*').eq('job_level->>department_id', String(jl.department_id)).eq('job_level->>subdepartment_id', String(jl.subdepartment_id));
        if (jl.class_id) query = query.eq('job_level->>class_id', String(jl.class_id)); else query = query.is('job_level->>class_id', null);
        if (jl.subclass_id) query = query.eq('job_level->>subclass_id', String(jl.subclass_id)); else query = query.is('job_level->>subclass_id', null);
        const { data: requirement } = await query.maybeSingle();
        if (!requirement) return;
        setRequirementJobQuestions(requirement.job_specific_questions || []);
        const individualRequirements = requirement.requirements?.filter((req: any) => req.automationId || req.automation_id || req.web_automation?.automationId) || [];
        const globalAutoIds = requirement.web_automation?.map((auto: any) => auto.automationId).filter(Boolean) || [];
        const indivAutoIds = individualRequirements.map((req: any) => req.automationId || req.automation_id || req.web_automation?.automationId).filter(Boolean);
        const allAutomationIds = [...new Set([...globalAutoIds, ...indivAutoIds])];
        let finalWebDataItems: any[] = [];
        let fetchedAutos: any[] = [];
        if (allAutomationIds.length > 0) {
          const { data: autos } = await supabase.from('tm_automations').select('*').in('id', allAutomationIds);
          fetchedAutos = autos || [];
          const globalRefs = requirement.web_automation || [];
          const indivRefs = individualRequirements.map((req: any) => ({ automationId: req.automationId || req.automation_id || req.web_automation?.automationId, documentName: req.name, documentId: req.id, ...(req.web_automation || {}) }));
          const allRefs = [...globalRefs, ...indivRefs];
          finalWebDataItems = allRefs.map((ref: any) => { const autoDef = fetchedAutos.find(a => a.id === ref.automationId); return { ...ref, fields: autoDef?.webdata || [], automationName: autoDef?.name, automation: autoDef }; }).filter(item => item.automationId);
          setWebData(finalWebDataItems);
        } else { setWebData([]); }
        const mappings = finalWebDataItems.map((item, idx) => ({ entityKey: `wd - ${idx}`, entityName: item.documentName || item.automationName || `Flow ${idx + 1}`, entityType: 'webdata', automationId: item.automationId, documentId: item.documentId, automation: item.automation }));
        setEntityAutomationMappings(mappings);
        if (mappings.length > 0) { if (!selectedAutomationId || !mappings.some(m => m.automationId === selectedAutomationId)) setSelectedAutomationId(mappings[0].automationId); } else { setSelectedAutomationId(''); }
        const fieldIds = finalWebDataItems.flatMap(i => { const fields = i.fields || []; const directIds = fields.flatMap((f: any) => f.linkedMasterFields || f.masterFieldIds || []); const arrayIds = fields.flatMap((f: any) => (f.arrayItems || []).flatMap((item: any) => item.linkedMasterFields || (item.linkedMasterFieldId ? [item.linkedMasterFieldId] : []))); return [...directIds, ...arrayIds]; }).filter(Boolean);
        const uniqueFieldIds = [...new Set(fieldIds)];
        if (uniqueFieldIds.length > 0) { const { data: fields } = await supabase.from('tm_job_fields').select('*').in('id', uniqueFieldIds); setJobFields(fields?.reduce((acc, f) => ({ ...acc, [f.id.toString()]: f }), {}) || {}); }
      } catch (error) { console.error('Error in fetchData:', error); } finally { setIsLoading(false); }
    };
    fetchData();
  }, [isOpen, task?.job_level]);

  useEffect(() => {
    if (isOpen && selectedAutomationId && Object.keys(jobFields).length > 0) {
      fetchSourceData();
      fetchDocumentFiles();
    }
  }, [selectedAutomationId, isOpen, Object.keys(jobFields).length, webData.length]);

  useEffect(() => {
    const fetchIndividualName = async () => {
      if (!currentIndividualId) return;
      if (relationshipData?.principal?.full_name) { setIndividualName(relationshipData.principal.full_name); return; }
      if (relationshipData?.principal?.first_name && relationshipData?.principal?.last_name) { setIndividualName(`${relationshipData.principal.first_name} ${relationshipData.principal.last_name} `); return; }
      const taskData = enhancedTasksData.get(task?.id?.toString());
      const individualData = taskData?.applicant_data;
      if (individualData) {
        const name = individualData.full_name || (individualData.first_name && individualData.last_name ? `${individualData.first_name} ${individualData.last_name} ` : currentIndividualId);
        setIndividualName(name);
        return;
      }
      try {
        const { data: individual } = await supabase.from('registry_individuals').select('first_name, last_name, full_name').eq('id', currentIndividualId).single();
        if (individual) {
          const name = individual.full_name || (individual.first_name && individual.last_name ? `${individual.first_name} ${individual.last_name} ` : currentIndividualId);
          setIndividualName(name);
        }
      } catch (error) {
        console.error('Error fetching individual name:', error);
        setIndividualName(currentIndividualId);
      }
    };
    fetchIndividualName();
  }, [currentIndividualId, relationshipData, enhancedTasksData, task?.id]);

  useEffect(() => {
    const runComputation = async () => {
      if (!currentIndividualId || !selectedAutomationId) return;
      const cid = relationshipData?.company?.id || task?.company_id;
      const activeWeb = webData.find(w => w.automationId === selectedAutomationId);
      const computedFields = activeWeb?.fields?.filter((f: any) => f.fieldType === 'computed')?.map((f: any) => ({ variableName: f.variableName, computedFunction: f.computedFunction, computedDocuments: f.computedDocuments || [], entityContext: f.entityTypes?.[0] })) || [];
      if (computedFields.length === 0) { setComputedFieldsPreview({}); return; }
      const computedConfigs = activeWeb?.fields?.filter((f: any) => f.fieldType === 'computed') || [];
      setIsComputing(true);
      try {
        const results = {};
        for (const config of computedFields) {
          const originalField = computedConfigs.find(f => f.variableName === config.variableName);
          const val = await executeComputedField(config.computedFunction, currentIndividualId, config.computedDocuments, null, 'latest', null, originalField?.computed_config, cid, config.entityContext);
          results[config.variableName] = val;
        }
        setComputedFieldsPreview(results);
      } catch (error) { console.error('Error auto-computing fields:', error); } finally { setIsComputing(false); }
    };
    const timer = setTimeout(runComputation, 500);
    return () => clearTimeout(timer);
  }, [currentIndividualId, selectedAutomationId, webData, relationshipData, task]);

  const cleanFormData = (data: Record<string, any>): Record<string, any> => {
    const cleaned: Record<string, any> = {};
    for (const [key, value] of Object.entries(data)) {
      if (value === null || value === undefined || value === '' || value === 'Missing') {
        continue;
      }
      if (Array.isArray(value)) {
        const cleanedArray = value
          .map(item => {
            if (typeof item === 'object' && item !== null) {
              const cleanedItem: Record<string, any> = {};
              let hasMeaningfulData = false;
              for (const [itemKey, itemValue] of Object.entries(item)) {
                if (['entityId', 'index', 'id'].includes(itemKey)) {
                  cleanedItem[itemKey] = itemValue;
                  continue;
                }
                if (itemValue !== null && itemValue !== undefined && itemValue !== '' && itemValue !== 'Missing') {
                  cleanedItem[itemKey] = itemValue;
                  hasMeaningfulData = true;
                }
              }
              return hasMeaningfulData ? cleanedItem : null;
            }
            return item;
          })
          .filter(item => item !== null);
        if (cleanedArray.length > 0) {
          cleaned[key] = cleanedArray;
        }
      } else if (typeof value === 'object' && value !== null) {
        const cleanedObj: Record<string, any> = {};
        let hasMeaningfulData = false;
        for (const [objKey, objValue] of Object.entries(value)) {
          if (['entityId', 'index', 'id'].includes(objKey)) {
            cleanedObj[objKey] = objValue;
            continue;
          }
          if (objValue !== null && objValue !== undefined && objValue !== '' && objValue !== 'Missing') {
            cleanedObj[objKey] = objValue;
            hasMeaningfulData = true;
          }
        }
        if (hasMeaningfulData) {
          cleaned[key] = cleanedObj;
        }
      } else {
        cleaned[key] = value;
      }
    }
    return cleaned;
  };

  const handleRunAutomation = async () => {
    if (!selectedAutomationId) { toast({ title: "Validation Error", description: "Missing automation selection", variant: "destructive" }); return; }
    setIsAutomationRunning(true);
    try {
      const mapping = entityAutomationMappings.find(m => m.automationId === selectedAutomationId);
      if (!mapping?.automation) throw new Error("Automation configuration not found");
      const automation = mapping.automation;
      const automationLogin = automation.login || {};
      const activeWeb = webData.find(w => w.automationId === selectedAutomationId);
      const formData: Record<string, any> = {};
      activeWeb?.fields?.forEach((f: any) => {
        const targetId = resolveTargetEntityId(f);
        if (f.fieldType === 'array') {
          formData[f.variableName] = getArrayFieldData(f);
        } else if (f.fieldType === 'document') {
          const doc = documentFiles.find(d => f.linkedKycDocuments?.includes(d.document_id) && String(d.owner_id) === String(targetId));
          formData[f.variableName] = buildFileUrl(doc);
        } else if (f.fieldType === 'computed') {
          formData[f.variableName] = computedFieldsPreview[f.variableName];
        } else {
          const val = resolveVariableValue(f, String(targetId));
          formData[f.variableName] = val === "Missing" ? null : cleanFieldValue(val);
        }
      });
      const computedFields = activeWeb?.fields?.filter((f: any) => f.fieldType === 'computed')?.map((f: any) => ({ variableName: f.variableName, computedFunction: f.computedFunction, computedDocuments: f.computedDocuments || [], entityContext: f.entityTypes?.[0], computed_config: f.computed_config })) || [];
      if (computedFields.length > 0) {
        const cid = relationshipData?.company?.id || task?.company_id;
        for (const config of computedFields) {
          const val = await executeComputedField(config.computedFunction, currentIndividualId, config.computedDocuments, null, 'latest', null, config.computed_config, cid, config.entityContext);
          formData[config.variableName] = val;
        }
      }
      const cleanedFormData = cleanFormData(formData);
      const payload = {
        url: automationLogin.url || "https://fns.immigration.go.ke/account/login.html",
        photoPath: "",
        login: {
          email: automationLogin.email || "",
          idNumber: (typeof automationLogin.idNumber === 'string' && automationLogin.idNumber !== '[object Object]') ? automationLogin.idNumber : "",
          password: automationLogin.password || ""
        },
        formData: cleanedFormData,
        step2Data: {},
        step3Data: {}
      };

      const jobType = deriveAutomationType(automation);

      const { data: job, error } = await supabase
        .from('automation_jobs')
        .insert({
          type: jobType,
          status: 'pending',
          data: payload,
          retry_count_max: 3,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          created_by_id: actor.by_id,
        })
        .select()
        .single();

      if (error) throw new Error(error.message);
      if (!job) throw new Error('Failed to create automation job');

      setAutomationJobId(job.id);
      setAutomationProgress({
        isRunning: true,
        progress: 0,
        currentStep: 'Queued',
        message: 'Job queued, waiting for agent...',
        logs: [],
      });

      const interval = setInterval(() => {
        pollSupabaseJob(job.id);
      }, 2000);
      setPollingInterval(interval);

      toast({
        title: 'Automation Queued',
        description: `Job submitted for ${automation.name || jobType}. The agent will pick it up shortly.`,
      });

    } catch (e) {
      console.error("Automation Error:", e);
      toast({ title: 'Automation Error', description: e.message, variant: 'destructive' });
      setIsAutomationRunning(false);
    }
  };

  const cancelEditing = () => { setEditingCell(null); setEditValue(''); };
  const startEditing = async (fieldId: string, sourceIdx: number, table: string, path: string, val: string, entityId: string, linkingVariable: string, fieldType?: string, computedFunction?: string, masterFieldId?: string | number) => {
    try {
      if (fieldType === 'computed' || computedFunction) { setEditingCell({ fieldId, sourceIdx, table, path, entityId, linkingVariable, fieldType, computedFunction }); setEditValue(val || ''); return; }
      if (table && entityId) {
        let record = sourceData[table]?.[entityId];
        if (!record) {
          let query = supabase.from(table).select('*');
          if (masterFieldId) { const masterField = jobFields[masterFieldId.toString()]; if (masterField?.sources?.length) { const source = masterField.sources.find(s => s.table === table); if (source?.linking_variable) { query = query.eq(source.linking_variable, entityId); } else { query = query.or(`id.eq.${entityId}, director_id.eq.${entityId}, company_id.eq.${entityId} `); } } else { query = query.or(`id.eq.${entityId}, director_id.eq.${entityId}, company_id.eq.${entityId} `); } } else { query = query.or(`id.eq.${entityId}, director_id.eq.${entityId}, company_id.eq.${entityId} `); }
          const { data, error } = await query.maybeSingle();
          if (error) throw error;
          record = data;
          if (record) { setSourceData(prev => ({ ...prev, [table]: { ...(prev[table] || {}), [entityId]: record } })); } else { throw new Error('Record not found'); }
        }
      }
      setEditingCell({ fieldId, sourceIdx, table, path, entityId, linkingVariable, fieldType, computedFunction });
      setEditValue(val || '');
    } catch (error) { console.error('Error starting edit:', error); toast({ title: 'Error', description: error.message || 'Failed to start editing. The record could not be loaded.', variant: 'destructive' }); }
  };

  const saveEdit = async (isDropdown?: boolean, dropdownOptions?: { label: string, value: string }[]) => {
    if (!editingCell) return;
    const { table, path, entityId, fieldType, computedFunction, fieldId, sourceIdx } = editingCell;
    let valueToSave = editValue;
    if (isDropdown && dropdownOptions && dropdownOptions.length > 0) {
      const selectedOption = dropdownOptions.find(opt => opt.value === editValue);
      if (selectedOption) {
        valueToSave = selectedOption.label;
      }
    }
    if (fieldType === 'computed' || computedFunction) {
      setComputedFieldsPreview(prev => ({ ...prev, [editingCell.fieldId]: valueToSave }));
      setEditingCell(null);
      setEditValue('');
      return;
    }
    if (!table || !path) {
      console.error('Missing table or path for non-computed field');
      toast({ title: 'Error', description: 'Missing required field information', variant: 'destructive' });
      return;
    }
    setIsLoadingData(true);
    try {
      let record = sourceData[table]?.[entityId];
      if (!record) {
        let query = supabase.from(table).select('*');
        if (table === 'tm_tasks') {
          query = query.eq('id', entityId);
        } else {
          query = query.or(`id.eq.${entityId}, director_id.eq.${entityId}, company_id.eq.${entityId} `);
        }
        const { data: fetchedData, error: fetchError } = await query.maybeSingle();
        if (fetchError) throw fetchError;
        if (!fetchedData) throw new Error(`Record not found in table ${table} with identifier ${entityId} `);
        record = fetchedData;
        setSourceData(prev => ({
          ...prev,
          [table]: { ...(prev[table] || {}), [entityId]: record }
        }));
      }
      let queryField = 'id';
      let recordPK = entityId;
      if (table === 'tm_tasks') {
        queryField = 'id';
        recordPK = record.id;
      }
      else if (record.director_id) { queryField = 'director_id'; recordPK = record.director_id; }
      else if (record.company_id) { queryField = 'company_id'; recordPK = record.company_id; }
      else { queryField = 'id'; recordPK = record.id; }
      const { data: existing, error: fetchError } = await supabase
        .from(table)
        .select('*')
        .eq(queryField, recordPK)
        .single();
      if (fetchError) throw fetchError;
      if (!existing) throw new Error(`Record not found in database: ${recordPK} `);
      const updated = updateJsonValue(existing, path, valueToSave);
      const { data: updatedRecord, error: updateError } = await supabase
        .from(table)
        .update({
          ...updated,
          updated_at: new Date().toISOString(),
          updated_by_id: actor.by_id,
        })
        .eq(queryField, recordPK)
        .select()
        .single();
      if (updateError) throw updateError;
      if (updatedRecord) {
        setSourceData(prev => ({
          ...prev,
          [table]: { ...(prev[table] || {}), [entityId]: updatedRecord }
        }));
        toast({ title: 'Success', description: 'Field updated successfully', variant: 'default' });
        if (refreshDocuments) {
          refreshDocuments();
        }
      }
    } catch (error) {
      console.error('Error saving field:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to update field',
        variant: 'destructive'
      });
    } finally {
      setEditingCell(null);
      setEditValue('');
      setIsLoadingData(false);
    }
  };

  const selectedMapping = useMemo(() => entityAutomationMappings.find(m => m.automationId === selectedAutomationId), [selectedAutomationId, entityAutomationMappings]);
  const activeWebEntry = useMemo(() => webData.find(e => e.automationId === selectedAutomationId), [selectedAutomationId, webData]);

  const getDependentDropdownOptions = useCallback((field: any, linkedJobField: any, targetId: string) => {
    const opts = linkedJobField?.options;
    if (!opts?.isDependencyConfig) { if (Array.isArray(opts)) { return opts.map((o: any) => typeof o === 'string' ? { label: o, value: o } : o); } return []; }
    const parentFieldId = opts.dependencyConfig?.dependentFieldId;
    if (!parentFieldId) return [];
    const parentField = jobFields[parentFieldId];
    if (!parentField) return [];
    let entityCategory = 'individual';
    if (field.entityTypes?.includes('company')) entityCategory = 'company';
    let sourceIdx = parentField.sources?.findIndex((s: any) => s.source_type === entityCategory);
    if (sourceIdx === -1 || sourceIdx === undefined) sourceIdx = 0;
    const parentLabelValue = getFieldValue(String(parentFieldId), String(targetId), sourceIdx);
    let parentValueForMapping = parentLabelValue;
    const parentFieldOptions = parentField.options;
    if (Array.isArray(parentFieldOptions) && parentLabelValue && parentLabelValue !== 'Missing' && parentLabelValue !== 'Computing...') { const matchingParentOption = parentFieldOptions.find((opt: any) => { const optLabel = typeof opt === 'string' ? opt : opt.label; return optLabel === parentLabelValue; }); if (matchingParentOption) { parentValueForMapping = typeof matchingParentOption === 'string' ? matchingParentOption : matchingParentOption.value; } }
    if (!parentValueForMapping || parentValueForMapping === 'Missing' || parentValueForMapping === 'Computing...') return [];
    const availableOptions = opts.manualMapping?.[parentValueForMapping] || [];
    return availableOptions;
  }, [jobFields, getFieldValue]);

  const filteredFields = useMemo(() => {
    if (!activeWebEntry || !activeWebEntry.fields || activeWebEntry.fields.length === 0) return [];
    return activeWebEntry.fields;
  }, [activeWebEntry]);

  const processedFields = useMemo(() => filteredFields.map((field) => {
    const targetId = resolveTargetEntityId(field);
    let value = "";
    if (field.fieldType === 'array') {
      const data = getArrayFieldData(field);
      value = data.length > 0 ? `${data.length} Items Found` : "Missing";
    } else if (field.fieldType === 'document') {
      const foundDoc = documentFiles.find(d =>
        field.linkedKycDocuments?.includes(d.document_id) &&
        String(d.owner_id) === String(targetId)
      );
      value = foundDoc ? "Available" : "Missing";
    } else if (field.fieldType === 'computed') {
      value = computedFieldsPreview[field.variableName] || "Missing";
    } else {
      value = resolveVariableValue(field, String(targetId));
    }

    const hasDefault = !!(field.defaultValue && field.defaultValue !== 'Missing' && field.defaultValue !== '');

    return {
      ...field,
      resolvedValue: value,
      isMissing: !isValidValue(value),
      isDefault: hasDefault,
      targetId: String(targetId)
    };
  }), [filteredFields, resolveTargetEntityId, getArrayFieldData, documentFiles, computedFieldsPreview, resolveVariableValue]);

  const sortedFields = useMemo(() => {
    let fields = sortMissingFirst
      ? [...processedFields].sort((a, b) => (a.isMissing === b.isMissing ? 0 : a.isMissing ? -1 : 1))
      : [...processedFields];
    if (entitySort) {
      fields = fields.sort((a, b) => {
        const aKey = (a.entityTypes || []).slice().sort().join(',');
        const bKey = (b.entityTypes || []).slice().sort().join(',');
        return entitySort === 'asc' ? aKey.localeCompare(bKey) : bKey.localeCompare(aKey);
      });
    }
    return fields;
  }, [processedFields, sortMissingFirst, entitySort]);

  return (
    <AutomationMappingDialogUI
      isOpen={isOpen}
      onClose={onClose}
      isLoading={isLoading}
      isAutomationRunning={isAutomationRunning}
      isLoadingData={isLoadingData}
      isSavingScreenshot={isSavingScreenshot}
      task={task}
      taskId={taskId}
      individualName={individualName}
      savedScreenshotDoc={savedScreenshotDoc}
      selectedAutomationId={selectedAutomationId}
      setSelectedAutomationId={setSelectedAutomationId}
      entityAutomationMappings={entityAutomationMappings}
      selectedMapping={selectedMapping}
      activeWebEntry={activeWebEntry}
      automationProgress={automationProgress}
      automationJobId={automationJobId}
      logsEndRef={logsEndRef}
      activeTab={activeTab}
      setActiveTab={setActiveTab}
      processedFields={processedFields}
      sortedFields={sortedFields}
      sortMissingFirst={sortMissingFirst}
      setSortMissingFirst={setSortMissingFirst}
      entitySort={entitySort}
      setEntitySort={setEntitySort}
      editingCell={editingCell}
      editValue={editValue}
      setEditValue={setEditValue}
      saveEdit={saveEdit}
      cancelEditing={cancelEditing}
      startEditing={startEditing}
      expandedArrayFields={expandedArrayFields}
      toggleArrayFieldExpansion={toggleArrayFieldExpansion}
      jobFields={jobFields}
      sourceData={sourceData}
      requirementJobQuestions={requirementJobQuestions}
      documentFiles={documentFiles}
      computedFieldsPreview={computedFieldsPreview}
      getArrayFieldData={getArrayFieldData}
      getFieldValue={getFieldValue}
      resolveTargetEntityId={resolveTargetEntityId}
      getFileUrl={getFileUrl}
      handlePreviewDocument={handlePreviewDocument}
      handleSaveEditedDocument={handleSaveEditedDocument}
      handlePreviewDataChange={handlePreviewDataChange}
      getPrimaryTargetEntityId={getPrimaryTargetEntityId}
      getPrimaryEntityType={getPrimaryEntityType}
      setCurrentIndividualId={setCurrentIndividualId}
      stopAutomation={stopAutomation}
      handleRunAutomation={handleRunAutomation}
      showPreviewModal={showPreviewModal}
      setShowPreviewModal={setShowPreviewModal}
      previewingDocuments={previewingDocuments}
      setPreviewingDocuments={setPreviewingDocuments}
    />
  );
}
