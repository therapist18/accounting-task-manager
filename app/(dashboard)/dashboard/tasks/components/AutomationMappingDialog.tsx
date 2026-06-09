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
import { isValidValue, ETA_SCREENSHOT_DOCUMENT_ID, cleanFieldValue, formatDateValue, updateJsonValue, parseJsonValue } from '../utils/AutomationMappingDialog';
import { AutomationMappingDialogUI } from './AutomationMappingDialogUI';

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

export interface EntityAutomationMapping {
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
  
  const pollProgress = useCallback(async (jobId: string) => {
    try {
      const response = await fetch(`http://localhost:5000/api/permit/eta-kenya/progress/${jobId}`);
      if (response.status === 404) {
        console.log('Job completed - stopping polling');
        setPollingInterval(prevInterval => {
          if (prevInterval) {
            clearInterval(prevInterval);
          }
          return null;
        });
        setIsAutomationRunning(false);
        setAutomationProgress(prev => ({ ...prev, isRunning: false, message: 'Automation completed' }));
        return;
      }

      if (!response.ok) {
        console.error('Failed to fetch progress:', response.status);
        return;
      }

      const data = await response.json();
      if (data.success && data.progress) {
        setAutomationProgress(data.progress);
        if (!data.progress.isRunning) {
          setPollingInterval(prevInterval => {
            if (prevInterval) {
              clearInterval(prevInterval);
            }
            return null;
          });
          setIsAutomationRunning(false);
        }
      }
    } catch (error) {
      console.error('Error polling progress:', error);
      if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
        setPollingInterval(prevInterval => {
          if (prevInterval) {
            clearInterval(prevInterval);
          }
          return null;
        });
        setIsAutomationRunning(false);
      }
    }
  }, []);

  const stopAutomation = useCallback(async () => {
    if (!automationJobId) return;
    try {
      await fetch(`http://localhost:5000/api/permit/eta-kenya/progress/${automationJobId}`, { method: 'DELETE' });
    } catch (_) { }
    setPollingInterval(prev => { if (prev) clearInterval(prev); return null; });
    setIsAutomationRunning(false);
    setAutomationProgress(prev => prev ? { ...prev, isRunning: false, message: 'Stopped by user' } : prev);
  }, [automationJobId]);

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
          updated_at: new Date().toISOString()
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

  const resolveTargetEntityId = useCallback((field: any) => {
    const types = field.entityTypes || [];
    if (types.includes('dependant')) {
      if (field.dependantRelationships && field.dependantRelationships.length > 0) {
        const dep = relationshipData?.dependants?.find((d: any) =>
          field.dependantRelationships.includes(d.relationship?.toLowerCase())
        );
        if (dep?.id) return dep.id;
      } else {
        const dep = relationshipData?.dependants?.[0];
        if (dep?.id) return dep.id;
      }
    }
    if (types.includes('sponsor') && relationshipData?.sponsor?.id) {
      return relationshipData.sponsor.id;
    }
    if (types.includes('director') && relationshipData?.directors?.[0]?.id) {
      return relationshipData.directors[0].id;
    }
    if (types.includes('understudy') && relationshipData?.understudy?.id) {
      return relationshipData.understudy.id;
    }
    if (types.includes('principal')) {
      const pid = relationshipData?.principal?.id || currentIndividualId;
      if (pid) return pid;
    }
    if (types.includes('company')) {
      const companyId = relationshipData?.company?.id || task?.company_id;
      if (companyId) return companyId;
    }
    return undefined;
  }, [relationshipData, currentIndividualId, task]);

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

  const resolveEntityIdsForArray = (field: any, relationshipData: any) => {
    const types = field.entityTypes || [];
    const collectedIds = new Set<string>();
    types.forEach(type => {
      const t = type.toLowerCase();
      if (t === 'principal') {
        const pid = relationshipData?.principal?.id || currentIndividualId;
        if (pid) collectedIds.add(String(pid));
      }
      if (t === 'dependant') {
        if (field.dependantRelationships && field.dependantRelationships.length > 0) {
          relationshipData?.dependants?.forEach((d: any) => {
            if (field.dependantRelationships.includes(d.relationship?.toLowerCase())) {
              collectedIds.add(String(d.id));
            }
          });
        } else {
          relationshipData?.dependants?.forEach((d: any) => collectedIds.add(String(d.id)));
        }
      }
      if (t === 'sponsor' && relationshipData?.sponsor?.id) {
        collectedIds.add(String(relationshipData.sponsor.id));
      }
      if (t === 'understudy' && relationshipData?.understudy?.id) {
        collectedIds.add(String(relationshipData.understudy.id));
      }
      if (t === 'director') {
        relationshipData?.directors?.forEach((d: any) => collectedIds.add(String(d.id)));
      }
      if (t === 'company') {
        const cid = relationshipData?.company?.id || task?.company_id;
        if (cid) collectedIds.add(String(cid));
      }
    });
    return Array.from(collectedIds);
  };

  const toggleArrayFieldExpansion = (fieldVariableName: string) => setExpandedArrayFields(prev => { const newSet = new Set(prev); if (newSet.has(fieldVariableName)) newSet.delete(fieldVariableName); else newSet.add(fieldVariableName); return newSet; });
  const toggleSourceFieldExpansion = (fieldId: string) => setExpandedSourceFields(prev => { const newSet = new Set(prev); if (newSet.has(fieldId)) newSet.delete(fieldId); else newSet.add(fieldId); return newSet; });

  const resolveVariableValue = useCallback((fieldDef: any, targetEntityId: string) => {
    if (fieldDef.defaultValue && fieldDef.defaultValue !== 'Missing' && fieldDef.defaultValue !== '') {
      return fieldDef.defaultValue;
    }
    const logic = fieldDef.sourceLogic || 'priority';
    const masterIds = fieldDef.linkedMasterFields || [];
    const questionIds = fieldDef.linkedJobQuestionIds || [];
    const extractionMode = fieldDef.extractionMode || 'latest';
    const collectedValues: string[] = [];
    for (const mid of masterIds) {
      const val = getFieldValue(String(mid), String(targetEntityId), 0, extractionMode);
      if (isValidValue(val)) {
        if (logic === 'priority') return val;
        collectedValues.push(val);
      }
    }
    const taskRecord = sourceData['tm_tasks']?.[String(taskId)];
    const answers = taskRecord?.job_specific_answers || {};
    for (const qId of questionIds) {
      const answer = answers[String(qId)] ?? answers[Number(qId)];
      if (isValidValue(answer)) {
        const cleanAnswer = cleanFieldValue(answer);
        if (logic === 'priority') return cleanAnswer;
        collectedValues.push(cleanAnswer);
      }
    }
    if (logic === 'all' && collectedValues.length > 0) {
      return collectedValues.join(', ');
    }
    if (fieldDef.default_value && fieldDef.default_value !== 'Missing') return fieldDef.default_value;
    return "Missing";
  }, [sourceData, jobFields, masterFieldComputedValues, taskId]);

  const getArrayFieldData = (field: any) => {
    const entityIds = resolveEntityIdsForArray(field, relationshipData);
    const arrayData = [];

    entityIds.forEach((entityId, index) => {
      const rowValues: any = {};

      field.arrayItems?.forEach((col: any) => {
        // Use the same resolution logic for array columns
        const val = resolveVariableValue(col, String(entityId));

        let finalVal = val;
        if (col.type === 'date' && isValidValue(val)) {
          finalVal = formatDateValue(val, col.dateFormat);
        }

        rowValues[col.variableName] = cleanFieldValue(finalVal);
      });

      if (Object.keys(rowValues).length > 0) {
        arrayData.push({ ...rowValues, entityId, index });
      }
    });
    return arrayData;
  };

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
      const standardFetchQueue = new Map<string, { table: string, ids: Set<string>, linkingVariable: string }>();
      const addToQueue = (table: string, linkingVar: string, id: string) => { const queueKey = `${table}: ${linkingVar}`; if (!standardFetchQueue.has(queueKey)) { standardFetchQueue.set(queueKey, { table, ids: new Set(), linkingVariable: linkingVar }); } standardFetchQueue.get(queueKey)!.ids.add(id); };
      const computedRequirements = { individualIds: new Set<string>(), documentIds: new Set<string>() };
      const activeAutomation = webData.find(w => w.automationId === selectedAutomationId);
      const fieldsToProcess = activeAutomation?.fields || [];
      const computedMasterFields: any[] = [];
      fieldsToProcess.forEach((field: any) => {
        const questionIds = field.linkedJobQuestionIds || [];
        if (questionIds.length > 0) { if (taskId) addToQueue('tm_tasks', 'id', String(taskId)); return; }
        const isArray = field.fieldType === 'array';
        const cols = isArray ? (field.arrayItems || []) : [{ linkedMasterFieldId: field.linkedMasterFields?.[0] || field.masterFieldIds?.[0] }];
        let entityIds: string[] = [];
        if (isArray) { entityIds = resolveEntityIdsForArray(field, relationshipData); } else { const targetId = resolveTargetEntityId(field); if (targetId) entityIds = [String(targetId)]; }
        cols.forEach((col: any) => {
          const fieldIds = col.linkedMasterFields || (col.linkedMasterFieldId ? [col.linkedMasterFieldId] : []);
          const mid = fieldIds[0] || field.linkedMasterFields?.[0] || field.masterFieldIds?.[0];
          if (!mid) return;
          const jobField = jobFields[mid];
          if (!jobField) return;
          const computedSource = jobField.sources?.find((s: any) => s.is_computed === true);
          if (computedSource) {
            const extractionMode = col.extractionMode || field.extractionMode || 'latest';
            (computedSource.document_id || []).forEach((did: string) => computedRequirements.documentIds.add(did));
            entityIds.forEach(id => { computedRequirements.individualIds.add(String(id)); computedMasterFields.push({ field: jobField, entityId: String(id), extractionMode, computedSource }); });
          }
          jobField.sources?.forEach((source: any) => {
            if (source.is_computed) return;
            if (!source.table) return;
            const linkingVar = source.linking_variable || 'id';
            if (source.table === 'tm_tasks' && (!source.linking_variable || source.linking_variable === 'id')) { if (taskId) addToQueue(source.table, linkingVar, String(taskId)); }
            else { entityIds.forEach(id => { addToQueue(source.table, linkingVar, String(id)); }); }
          });
        });
      });
      const newSourceData: Record<string, Record<string, any>> = {};
      const documentCache = { documents: [], docTypes: [] };
      const fetchPromises = [];
      for (const [queueKey, { table, ids, linkingVariable }] of standardFetchQueue.entries()) {
        const idArray = Array.from(ids);
        if (idArray.length === 0) continue;
        fetchPromises.push(supabase.from(table).select('*').in(linkingVariable, idArray).then(({ data, error }) => { if (!error && data) { if (!newSourceData[table]) newSourceData[table] = {}; data.forEach(record => { const recordKey = String(record[linkingVariable]); newSourceData[table][recordKey] = record; if (table === 'tm_tasks' && record.id) { newSourceData[table][String(record.id)] = record; } }); if (table === 'acc_portal_directors_documents') { documentCache.documents.push(...data); } } }));
      }
      await Promise.all(fetchPromises);
      const neededDocTypes = Array.from(computedRequirements.documentIds);
      if (neededDocTypes.length > 0) {
        const remainingPeople = Array.from(computedRequirements.individualIds);
        await Promise.all([
          supabase.from('acc_portal_kyc').select('*').in('id', neededDocTypes).then(({ data }) => { if (data) documentCache.docTypes = data; }),
          supabase.from('acc_portal_directors_documents').select('*').in('director_id', remainingPeople).in('document_id', neededDocTypes).neq('status', 'deleted').then(({ data }) => { if (data) documentCache.documents.push(...data); })
        ]);
      }
      if (computedMasterFields.length > 0) {
        const newComputedValues: Record<string, any> = {};
        for (const item of computedMasterFields) {
          const { field, entityId, extractionMode, computedSource } = item;
          let functionToCall = computedSource.computed_function || 'extractFieldFromLatestDocument';
          if (functionToCall === 'getLatestDocument' && computedSource.path) { functionToCall = 'extractFieldFromLatestDocument'; }
          const val = await executeComputedField(functionToCall, entityId, computedSource.document_id || [], computedSource.path, extractionMode, documentCache, computedSource.computed_config);
          newComputedValues[`${field.id}_${entityId}_${extractionMode}`] = val;
        }
        setMasterFieldComputedValues(newComputedValues);
      }
      setSourceData(newSourceData);
    } catch (error) { console.error("Fetch Error:", error); } finally { isFetchingRef.current = false; setIsLoadingData(false); }
  }, [jobFields, selectedAutomationId, webData, resolveTargetEntityId, relationshipData, isOpen, taskId]);

  const getSourceValue = (table: string, path: string, entityId: string, extractionMode?: 'latest' | 'all') => {
    const tableData = sourceData[table];
    if (!tableData) return "Missing";
    const record = tableData[entityId];
    if (!record) return "Missing";
    const val = parseJsonValue(record, path, extractionMode);
    return val !== undefined && val !== null ? String(val) : "Missing";
  };

  const getFieldValue = (fieldIdOrVariable: string, entityId: string, sourceIdx: number = 0, extractionMode: string = 'latest', preserveArray: boolean = false) => {
    const activeAuto = webData.find(w => w.automationId === selectedAutomationId);
    const fieldDef = activeAuto?.fields?.find(f => f.variableName === fieldIdOrVariable || String(f.id) === String(fieldIdOrVariable));

    const jobQuestionIds = fieldDef?.linkedJobQuestionIds || [];

    if (jobQuestionIds.length > 0) {
      const taskRecord = sourceData['tm_tasks']?.[String(taskId)];
      if (!taskRecord) return isLoadingData ? "Loading Task Data..." : "Missing Task Data";

      const answers = taskRecord.job_specific_answers || {};

      // Iterate through all linked IDs and return the first valid answer found
      for (const qId of jobQuestionIds) {
        const answer = answers[String(qId)] ?? answers[Number(qId)];
        if (answer !== undefined && answer !== null && String(answer).trim() !== "") {
          return String(answer);
        }
      }
      return "Missing";
    }

    const field = jobFields[fieldIdOrVariable];
    if (!field) return isLoading ? "Loading Config..." : "Missing Config";

    const sortedSources = field.sources?.sort((a: any, b: any) => (a.priority || 999) - (b.priority || 999)) || [];

    for (let i = 0; i < sortedSources.length; i++) {
      const source = sortedSources[i];
      if (!source) continue;

      if (source.is_computed) {
        const key = `${field.id}_${entityId}_${extractionMode}`;
        const val = masterFieldComputedValues[key];

        if (val === undefined) return isLoadingData ? "Computing..." : "Computing...";
        if (typeof val === 'string' && !val.startsWith('{')) {
          // CRITICAL: Strict validation of error strings to ensure fallback
          const isErrorString = val === 'Document Not Found' || val === 'Missing Document' ||
            val === 'No Document Specified' || val === 'Field Not Found' ||
            val === 'Number Not Found' || val === 'Missing' || val === 'No Source';
          if (!isErrorString) return val;
          // If it is an error string, fall through to continue loop
        } else {
          // Valid object or array
          let parsedVal = val;
          if (typeof val === 'string' && val.startsWith('{')) { try { parsedVal = JSON.parse(val); } catch (e) { } }
          if (typeof parsedVal === 'object' && parsedVal !== null && source.path) {
            const pathMatch = source.path.match(/['"]([\w_]+)['"]$/);
            const fieldName = pathMatch ? pathMatch[1] : null;
            if (fieldName && parsedVal[fieldName]) return String(parsedVal[fieldName]);
          }
          const isValidValue = val !== null && val !== undefined && !((Array.isArray(val) && val.length === 0) || val === '');
          if (isValidValue) {
            if (typeof parsedVal === 'object' && parsedVal !== null) { return parsedVal.en || parsedVal.name || parsedVal.title || String(Object.values(parsedVal)[0]); }
            return String(val);
          }
        }
        continue;
      }

      let lookupId = String(entityId);
      if (source.table === 'tm_tasks' && (!source.linking_variable || source.linking_variable === 'id')) lookupId = String(taskId);
      const value = getSourceValue(source.table, source.path, lookupId, extractionMode as 'latest' | 'all');
      if (value !== null && value !== undefined && value !== '' && value !== 'Missing') return value;
    }

    // Check for default value if all sources returned "Missing"
    if (fieldDef?.default_value) {
      return fieldDef.default_value;
    }

    // Handle image properties - return structured object for image fields with dimensions and alignment
    if (fieldDef?.fieldType === 'image') {
      const imageProps = {
        url: "Missing",
        width: fieldDef.image_width || 'auto',
        height: fieldDef.image_height || 'auto',
        alignment: fieldDef.image_alignment || 'left'
      };

      // If we have a default value, try to parse it as image URL
      if (fieldDef.default_value && fieldDef.default_value !== "Missing") {
        imageProps.url = fieldDef.default_value;
      }

      return JSON.stringify(imageProps);
    }

    return "Missing";
  };

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
        })
        .select()
        .single();
      if (insertError) throw new Error(`DB insert failed: ${insertError.message} `);
      console.log('âœ… Screenshot saved to Supabase:', docRecord);
      return docRecord;
    } finally {
      setIsSavingScreenshot(false);
    }
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
      const res = await fetch(automation.webhook_url, { method: automation.webhook_method || 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!res.ok) throw new Error("Trigger failed: " + res.status);

      const response = await res.json();

      console.log('ðŸ” Debug - Response:', response);
      console.log('ðŸ” Debug - Automation ID:', mapping.automationId);
      console.log('ðŸ” Debug - Has jobId:', !!response.jobId);
      console.log('ðŸ” Debug - Includes eta:', mapping.automationId?.toLowerCase().includes('eta'));

      // â”€â”€ PROGRESS TRACKING: Capture jobId and start polling for eTA Kenya â”€â”€â”€â”€â”€â”€â”€â”€
      // TEMPORARY: Remove automation ID check for debugging
      if (response.jobId) {
        console.log('âœ… Starting polling for jobId:', response.jobId);
        setAutomationJobId(response.jobId);
        setAutomationProgress({ isRunning: true, progress: 0, currentStep: 'Initializing', message: 'Starting automation...' });

        // Start polling for progress
        const interval = setInterval(() => {
          pollProgress(response.jobId);
        }, 2000); // Poll every 2 seconds
        setPollingInterval(interval);
      } else {
        console.log('âŒ No jobId in response - polling will not start');
      }

      if (response.success) {
        // â”€â”€ SAVE SCREENSHOT TO SUPABASE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        if (response.screenshot) {
          const directorId = getPrimaryTargetEntityId();

          if (directorId && directorId !== 'N/A') {
            try {
              const savedDoc = await saveScreenshotToSupabase(response.screenshot, directorId);
              setSavedScreenshotDoc(savedDoc);

              // â”€â”€ AUTO-OPEN PREVIEW with the saved document â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
              const previewDoc = {
                ...savedDoc,
                file_path: savedDoc.file_path,
                file_name: savedDoc.file_name,
                extracted_details: savedDoc.extracted_details || {},
                document_fields: [],
              };
              setPreviewingDocuments({
                document_display_name: 'eTA Kenya Confirmation Screenshot',
                documents: [previewDoc],
                person_full_name: individualName || directorId,
                requirementId: ETA_SCREENSHOT_DOCUMENT_ID,
              });
              setShowPreviewModal(true);

              // Refresh parent document list
              if (refreshDocuments) refreshDocuments();

              toast({
                title: 'âœ… Automation Completed!',
                description: 'Screenshot saved and ready for review.',
              });
            } catch (saveErr: any) {
              console.error('Screenshot save error:', saveErr);
              toast({
                title: 'Automation Succeeded (screenshot save failed)',
                description: saveErr.message,
                variant: 'destructive',
              });
            }
          } else {
            // No valid director ID â€” fall back to download
            const screenshotDataUrl = `data: image / png; base64, ${response.screenshot} `;
            const link = document.createElement('a');
            link.href = screenshotDataUrl;
            link.download = `eta - confirmation - ${Date.now()}.png`;
            link.click();

            toast({
              title: 'âœ… Automation Completed!',
              description: response.message || 'Screenshot downloaded (no entity ID to save against).',
            });
          }
        } else {
          // No screenshot
          toast({
            title: 'âœ… Automation Completed!',
            description: response.message || 'Please check your email for payment instructions.',
          });
        }
      } else {
        throw new Error(response.message || 'Automation failed');
      }
    } catch (e) {
      console.error("Automation Error:", e);
      toast({ title: 'Automation Error', description: e.message, variant: 'destructive' });
    } finally {
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
          updated_at: new Date().toISOString()
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
      activeTab={activeTab}
      setActiveTab={setActiveTab}
      task={task}
      taskId={taskId}
      individualName={individualName}
      selectedAutomationId={selectedAutomationId}
      setSelectedAutomationId={setSelectedAutomationId}
      entityAutomationMappings={entityAutomationMappings}
      selectedMapping={selectedMapping}
      activeWebEntry={activeWebEntry}
      isLoading={isLoading}
      isLoadingData={isLoadingData}
      isAutomationRunning={isAutomationRunning}
      isSavingScreenshot={isSavingScreenshot}
      automationProgress={automationProgress}
      automationJobId={automationJobId}
      logsEndRef={logsEndRef}
      getPrimaryTargetEntityId={getPrimaryTargetEntityId}
      getPrimaryEntityType={getPrimaryEntityType}
      setCurrentIndividualId={setCurrentIndividualId}
      savedScreenshotDoc={savedScreenshotDoc}
      sortedFields={sortedFields}
      processedFields={processedFields}
      sortMissingFirst={sortMissingFirst}
      setSortMissingFirst={setSortMissingFirst}
      entitySort={entitySort}
      setEntitySort={setEntitySort}
      editingCell={editingCell}
      editValue={editValue}
      setEditValue={setEditValue}
      expandedArrayFields={expandedArrayFields}
      jobFields={jobFields}
      requirementJobQuestions={requirementJobQuestions}
      sourceData={sourceData}
      getArrayFieldData={getArrayFieldData}
      toggleArrayFieldExpansion={toggleArrayFieldExpansion}
      getFieldValue={getFieldValue}
      startEditing={startEditing}
      saveEdit={saveEdit}
      cancelEditing={cancelEditing}
      documentFiles={documentFiles}
      resolveTargetEntityId={resolveTargetEntityId}
      handlePreviewDocument={handlePreviewDocument}
      setPreviewingDocuments={setPreviewingDocuments}
      setShowPreviewModal={setShowPreviewModal}
      showPreviewModal={showPreviewModal}
      previewingDocuments={previewingDocuments}
      getFileUrl={getFileUrl}
      handleSaveEditedDocument={handleSaveEditedDocument}
      handlePreviewDataChange={handlePreviewDataChange}
      handleRunAutomation={handleRunAutomation}
      stopAutomation={stopAutomation}
    />
  );

}
