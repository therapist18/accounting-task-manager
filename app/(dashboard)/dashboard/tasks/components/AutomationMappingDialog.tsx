// @ts-nocheck
"use client"

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Loader2, Zap, User, Database, FileText,
  Settings, Webhook, ChevronRight, AlertCircle,
  CheckCircle2, Edit3, X, Save, Calculator,
  FunctionSquare, ExternalLink, Paperclip, AlertTriangle,
  ArrowUpDown, Filter, Check, List, ChevronDown,
  HelpCircle
} from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from '@/hooks/use-toast';
import supabase from '@/lib/supabase/client';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { processComputedFields, executeComputedField } from '../utils/automationComputedFunctions';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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
}

interface EntityAutomationMapping {
  entityKey: string;
  entityName: string;
  entityType: string;
  automationId: string;
  documentId?: string;
  automation?: any;
}

// --- UTILS ---
const parseJsonValue = (data: any, path: string): any => {
  if (!data || !path) return undefined;
  if (path.includes('->>') || path.includes('->')) {
    const parts = path.split(/(->>|->)/);
    const column = parts[0].trim().replace(/['"]/g, '');
    const jsonPath = parts[2].trim().replace(/['"]/g, '');
    const jsonData = data[column];

    if (jsonData === undefined || jsonData === null) return undefined;

    return jsonPath.split('.').reduce((acc, key) => (acc && typeof acc === 'object' ? acc[key] : undefined), jsonData);
  }
  return path.split('.').reduce((acc, key) => (acc && typeof acc === 'object' ? acc[key] : undefined), data);
};

const updateJsonValue = (existingData: any, path: string, newValue: any): any => {
  if (!path) return { [path]: newValue };
  if (path.includes('->>') || path.includes('->')) {
    const parts = path.split(/(->>|->)/);
    const column = parts[0].trim().replace(/['"]/g, '');
    const jsonPath = parts[2].trim().replace(/['']/g, '');
    const currentJsonData = existingData?.[column] || {};
    const pathParts = jsonPath.split('.');
    const updatedJsonData = { ...currentJsonData };
    let current = updatedJsonData;
    for (let i = 0; i < pathParts.length - 1; i++) {
      if (!current[pathParts[i]]) current[pathParts[i]] = {};
      current = current[pathParts[i]];
    }
    current[pathParts[pathParts.length - 1]] = newValue;
    return { [column]: updatedJsonData };
  }
  const pathParts = path.split('.');
  const result: any = { ...existingData };
  let current = result;
  for (let i = 0; i < pathParts.length - 1; i++) {
    if (!current[pathParts[i]]) current[pathParts[i]] = {};
    current = current[pathParts[i]];
  }
  current[pathParts[pathParts.length - 1]] = newValue;
  return result;
};

const formatDateValue = (dateStr: string, format?: string) => {
  if (!dateStr || dateStr === 'Missing') return null;
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr;

  if (format === 'object_split') {
    return {
      day: date.getDate().toString(),
      month: date.toLocaleString('default', { month: 'short' }),
      year: date.getFullYear().toString()
    };
  }

  if (format === 'dd_mm_yyyy') {
    const d = String(date.getDate()).padStart(2, '0');
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const y = date.getFullYear();
    return `${d}/${m}/${y}`;
  }
  return date.toISOString().split('T')[0];
};

const mapEntityTypeToRegistry = (type?: string): string => {
  const map: Record<string, string> = {
    'principal': 'Principal',
    'director': 'Director',
    'understudy': 'Understudy',
    'employee': 'Employee',
    'dependant': 'Dependant'
  };
  return map[type?.toLowerCase()] || 'Principal';
};

export const AutomationMappingDialog = ({
  isOpen,
  onClose,
  classId,
  taskId,
  task,
  individualId,
  allDocuments = [],
  stage,
  relationshipData
}: AutomationMappingDialogProps) => {
  // --- STATE ---
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
  const [expandedArrayFields, setExpandedArrayFields] = useState<Set<string>>(new Set());
  const [expandedSourceFields, setExpandedSourceFields] = useState<Set<string>>(new Set());
  const lastFetchKey = React.useRef<string>('');
  const isFetchingRef = React.useRef(false);
  const [requirementJobQuestions, setRequirementJobQuestions] = useState<any[]>([]);

  const buildFileUrl = (linkedDoc: any): string | null => {
    if (!linkedDoc?.file_path) return null;
    const bucketName = 'kyc-documents';
    const filePath = linkedDoc.file_path?.startsWith(bucketName) ? linkedDoc.file_path : `${bucketName}/${linkedDoc.file_path}`;
    return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${filePath}`;
  };

  const resolveTargetEntityId = useCallback((field: any) => {
    const types = field.entityTypes || [];

    if (types.includes('company')) return relationshipData?.company?.id || task?.company_id;
    if (types.includes('dependant')) {
      if (field.dependantRelationships && field.dependantRelationships.length > 0) {
        const dep = relationshipData?.dependants?.find((d: any) => field.dependantRelationships.includes(d.relationship?.toLowerCase()));
        return dep?.id;
      }
      return relationshipData?.dependants?.[0]?.id;
    }
    if (types.includes('director')) return relationshipData?.directors?.[0]?.id;
    if (types.includes('understudy')) return relationshipData?.understudy?.id;

    return relationshipData?.principal?.id || currentIndividualId;
  }, [relationshipData, currentIndividualId, task]);

  const resolveEntityIdsForArray = (field: any, relationshipData: any) => {
    const types = field.entityTypes || [];
    if (types.includes('dependant')) {
      if (field.dependantRelationships && field.dependantRelationships.length > 0) {
        return (relationshipData?.dependants || [])
          .filter((d: any) => field.dependantRelationships.includes(d.relationship?.toLowerCase()))
          .map((d: any) => d.id);
      }
      return (relationshipData?.dependants || []).map((d: any) => d.id);
    }
    if (types.includes('director')) {
      if (field.directorType === 'primary') return (relationshipData?.directors || []).slice(0, 1).map((d: any) => d.id);
      return (relationshipData?.directors || []).map((d: any) => d.id);
    }
    if (types.includes('principal')) {
      const pid = relationshipData?.principal?.id;
      return pid ? [pid] : [];
    }
    return [];
  };

  const toggleArrayFieldExpansion = (fieldVariableName: string) => {
    setExpandedArrayFields(prev => {
      const newSet = new Set(prev);
      if (newSet.has(fieldVariableName)) {
        newSet.delete(fieldVariableName);
      } else {
        newSet.add(fieldVariableName);
      }
      return newSet;
    });
  };

  const toggleSourceFieldExpansion = (fieldId: string) => {
    setExpandedSourceFields(prev => {
      const newSet = new Set(prev);
      if (newSet.has(fieldId)) {
        newSet.delete(fieldId);
      } else {
        newSet.add(fieldId);
      }
      return newSet;
    });
  };

  const getArrayFieldData = (field: any) => {
    const entityIds = resolveEntityIdsForArray(field, relationshipData);
    const arrayData = [];

    entityIds.forEach((entityId, index) => {
      // Get values for each array item column
      const columnValues: any = {};
      field.arrayItems?.forEach((item: any) => {
        // Handle both linkedMasterFields (array) and linkedMasterFieldId (single value)
        const fieldIds = item.linkedMasterFields || (item.linkedMasterFieldId ? [item.linkedMasterFieldId] : []);
        const fieldId = String(fieldIds[0] || '');

        if (fieldId) {
          const itemExtractionMode = item.extractionMode || 'latest';
          const value = getFieldValue(fieldId, String(entityId), 0, itemExtractionMode, true);
          // Use item.variableName as the key for storage
          const columnKey = item.variableName || fieldId;
          columnValues[columnKey] = value;
        }
      });

      // Calculate max rows - if any column has array values, we need multiple rows
      const maxRows = Math.max(1, ...Object.values(columnValues).map((v: any) => Array.isArray(v) ? v.length : 1));

      // Create a row for each array element
      for (let i = 0; i < maxRows; i++) {
        const rowData: any = {
          index: arrayData.length + 1,
          entityId: String(entityId)
        };

        field.arrayItems?.forEach((item: any) => {
          const columnKey = item.variableName || String((item.linkedMasterFields || [])[0] || item.linkedMasterFieldId || '');
          let value = columnValues[columnKey];

          // If value is an array (from extractionMode: 'all'), get the i-th element
          if (Array.isArray(value)) {
            rowData[columnKey] = value[i] !== undefined && value[i] !== '' ? value[i] : "";
          } else {
            // Single value - repeat for all rows or only show on first row
            rowData[columnKey] = (i === 0 && value !== undefined && value !== 'Computing...') ? value : "";
          }
        });

        arrayData.push(rowData);
      }
    });

    return arrayData;
  };

  const getMasterFieldDisplayName = (masterFieldId: string | number, itemName?: string) => {
    // If itemName is provided (from array item), use that first
    if (itemName) {
      return itemName;
    }

    // Convert to string for consistent comparison
    const fieldIdStr = String(masterFieldId);

    // Look up the master field in jobFields to get its display name
    const masterField = jobFields[fieldIdStr];
    if (masterField) {
      const displayName = masterField.label || masterField.field_key || masterField.table_header || fieldIdStr;
      return displayName;
    }

    // If not found in jobFields, try to find it in the active web entry fields
    const activeWebEntry = webData.find(w => w.automationId === selectedAutomationId);
    if (activeWebEntry?.fields) {
      const field = activeWebEntry.fields.find((f: any) => {
        const linkedFields = f.linkedMasterFields || f.masterFieldIds || [];
        return linkedFields.some((id: any) => String(id) === fieldIdStr) ||
          f.variableName === fieldIdStr;
      });
      if (field) {
        const displayName = field.efnsDisplayName || field.variableName || fieldIdStr;
        return displayName;
      }
    }

    // Try to find by searching through all jobFields for matching linkedMasterFields
    for (const [key, field] of Object.entries(jobFields)) {
      const linkedFields = field.linkedMasterFields || field.masterFieldIds || [];
      if (linkedFields.some((id: any) => String(id) === fieldIdStr)) {
        const displayName = field.label || field.field_key || field.table_header || key;
        return displayName;
      }
    }

    // Fallback to the ID if no display name found
    return fieldIdStr;
  };

  const fetchSourceData = useCallback(async () => {
    if (!isOpen || !selectedAutomationId || Object.keys(jobFields).length === 0 || !webData.length) {
      return;
    }

    const fetchKey = `${selectedAutomationId}-${Object.keys(jobFields).length}-${webData.length}-${Date.now()}`;
    if (isFetchingRef.current) return;

    lastFetchKey.current = fetchKey;
    isFetchingRef.current = true;
    setIsLoadingData(true);

    try {
      const standardFetchQueue = new Map<string, { table: string, ids: Set<string>, linkingVariable: string }>();

      const addToQueue = (table: string, linkingVar: string, id: string) => {
        const queueKey = `${table}:${linkingVar}`;
        if (!standardFetchQueue.has(queueKey)) {
          standardFetchQueue.set(queueKey, { table, ids: new Set(), linkingVariable: linkingVar });
        }
        standardFetchQueue.get(queueKey)!.ids.add(id);
      };

      const computedRequirements = {
        individualIds: new Set<string>(),
        documentIds: new Set<string>()
      };

      const activeAutomation = webData.find(w => w.automationId === selectedAutomationId);
      const fieldsToProcess = activeAutomation?.fields || [];
      const computedMasterFields: any[] = [];

      fieldsToProcess.forEach((field: any) => {
        if (field.linkedJobQuestionId) {
          if (taskId) addToQueue('tm_tasks', 'id', String(taskId));
          return;
        }

        const isArray = field.fieldType === 'array';
        const cols = isArray
          ? (field.arrayItems || [])
          : [{ linkedMasterFieldId: field.linkedMasterFields?.[0] || field.masterFieldIds?.[0] }];

        let entityIds: string[] = [];
        if (isArray) {
          entityIds = resolveEntityIdsForArray(field, relationshipData);
        } else {
          const targetId = resolveTargetEntityId(field);
          if (targetId) entityIds = [String(targetId)];
        }

        cols.forEach((col: any) => {
          const fieldIds = col.linkedMasterFields || (col.linkedMasterFieldId ? [col.linkedMasterFieldId] : []);
          const mid = fieldIds[0] || field.linkedMasterFields?.[0] || field.masterFieldIds?.[0];
          if (!mid) return;

          const jobField = jobFields[mid];
          if (!jobField) return;

          if (jobField.is_computed || jobField.computed_config?.is_computed) {
            const extractionMode = col.extractionMode || field.extractionMode || 'latest';
            const config = jobField.computed_config || {};
            (config.document_ids || []).forEach((did: string) => computedRequirements.documentIds.add(did));
            entityIds.forEach(id => {
              computedRequirements.individualIds.add(String(id));
              computedMasterFields.push({ field: jobField, entityId: String(id), extractionMode });
            });
          }
          else {
            jobField.sources?.forEach((source: any) => {
              if (source.table && entityIds.length > 0) {
                let linkVar = source.linking_variable;
                if (!linkVar) {
                  if (source.table === 'acc_portal_directors_documents') linkVar = 'director_id';
                  else if (source.table === 'acc_portal_company_documents') linkVar = 'company_id';
                  else linkVar = 'id';
                }

                if (source.table === 'tm_tasks' && linkVar === 'id') {
                  if (taskId) addToQueue('tm_tasks', 'id', String(taskId));
                } else {
                  entityIds.forEach(id => addToQueue(source.table, linkVar, String(id)));
                }
              }
            });
          }
        });
      });

      const newSourceData: Record<string, Record<string, any>> = {};
      const documentCache = { documents: [], docTypes: [] };
      const fetchPromises = [];

      for (const [queueKey, { table, ids, linkingVariable }] of standardFetchQueue.entries()) {
        const idArray = Array.from(ids);
        if (idArray.length === 0) continue;


        fetchPromises.push(
          supabase.from(table)
            .select('*')
            .in(linkingVariable, idArray)
            .then(({ data, error }) => {
              if (!error && data) {
                if (!newSourceData[table]) newSourceData[table] = {};
                data.forEach(record => {
                  const recordKey = String(record[linkingVariable]);
                  newSourceData[table][recordKey] = record;

                  // Ensure tm_tasks records are indexed by 'id' specifically
                  if (table === 'tm_tasks' && record.id) {
                    newSourceData[table][String(record.id)] = record;
                  }
                });

                if (table === 'acc_portal_directors_documents') {
                  documentCache.documents.push(...data);
                }
              }
            })
        );
      }

      await Promise.all(fetchPromises);


      // Handle remaining computed logic (Documents/Functions)
      const neededDocTypes = Array.from(computedRequirements.documentIds);
      if (neededDocTypes.length > 0) {
        const remainingPeople = Array.from(computedRequirements.individualIds);
        await Promise.all([
          supabase.from('acc_portal_kyc').select('*').in('id', neededDocTypes)
            .then(({ data }) => { if (data) documentCache.docTypes = data; }),
          supabase.from('acc_portal_directors_documents')
            .select('*')
            .in('director_id', remainingPeople)
            .in('document_id', neededDocTypes)
            .neq('status', 'deleted')
            .then(({ data }) => { if (data) documentCache.documents.push(...data); })
        ]);
      }

      if (computedMasterFields.length > 0) {
        const newComputedValues: Record<string, any> = {};
        for (const item of computedMasterFields) {
          const { field, entityId, extractionMode } = item;
          const config = field.computed_config || {};
          const source = field.sources?.[0];

          const val = await executeComputedField(
            config.computed_function || 'extractFieldFromLatestDocument',
            entityId,
            config.document_ids || [],
            source?.path,
            extractionMode,
            documentCache,
            config.arithmeticConfig
          );

          newComputedValues[`${field.id}_${entityId}_${extractionMode}`] =
            (typeof val === 'object' && val !== null && !Array.isArray(val)) ? JSON.stringify(val) : val;
        }
        setMasterFieldComputedValues(newComputedValues);
      }

      setSourceData(newSourceData);

    } catch (error) {
      console.error("Fetch Error:", error);
    } finally {
      isFetchingRef.current = false;
      setIsLoadingData(false);
    }
  }, [jobFields, selectedAutomationId, webData, resolveTargetEntityId, relationshipData, isOpen, taskId]);

  const getSourceValue = (table: string, path: string, entityId: string) => {
    const tableData = sourceData[table];
    if (!tableData) return "Missing";

    const record = tableData[entityId];
    if (!record) return "Missing";
    const val = parseJsonValue(record, path);
    return val !== undefined && val !== null ? String(val) : "Missing";
  };

  const getFieldValue = (fieldIdOrVariable: string, entityId: string, sourceIdx: number = 0, extractionMode: string = 'latest', preserveArray: boolean = false) => {
    const activeAuto = webData.find(w => w.automationId === selectedAutomationId);

    // Look up field by variableName OR ID
    const fieldDef = activeAuto?.fields?.find(f =>
      f.variableName === fieldIdOrVariable ||
      String(f.id) === String(fieldIdOrVariable)
    );

    // --- JOB QUESTION LOGIC ---
    if (fieldDef?.linkedJobQuestionId) {

      const taskRecord = sourceData['tm_tasks']?.[String(taskId)];

      if (!taskRecord) {
        console.warn(`[getFieldValue] NO Task Record found in sourceData for Task ID: ${taskId}. Available Task records:`, Object.keys(sourceData['tm_tasks'] || {}));
        return "Missing Task Data";
      }

      const answers = taskRecord.job_specific_answers || {};
      const questionId = String(fieldDef.linkedJobQuestionId);

      // Robust lookup: try string key, then try number key
      let answer = answers[questionId];
      if (answer === undefined || answer === null) {
        answer = answers[Number(questionId)];
      }

      return (answer !== undefined && answer !== null) ? String(answer) : "Missing";
    }

    // --- STANDARD MASTER FIELD LOGIC ---
    const field = jobFields[fieldIdOrVariable];
    if (!field) return "Missing Config";

    if (field.is_computed || field.computed_config?.is_computed) {
      const key = `${field.id}_${entityId}_${extractionMode}`;
      const val = masterFieldComputedValues[key];
      if (val === undefined) return "Computing...";
      if (typeof val === 'object' && val !== null) {
        return Array.isArray(val) ? (preserveArray ? val : val.join(', ')) : JSON.stringify(val);
      }
      return String(val);
    }

    let entityCategory = (entityId === String(relationshipData?.company?.id) || entityId === String(task?.company_id))
      ? 'company' : 'individual';

    let source = field.sources?.find((s: any) => s.source_type === entityCategory) || field.sources?.[sourceIdx] || field.sources?.[0];
    if (!source) return "No Source";

    let lookupId = String(entityId);
    if (source.table === 'tm_tasks' && (!source.linking_variable || source.linking_variable === 'id')) {
      lookupId = String(taskId);
    }

    return getSourceValue(source.table, source.path, lookupId);
  };

  // --- DOCUMENT FETCHER ---
  const fetchDocumentFiles = useCallback(async () => {
    if (!isOpen || !selectedAutomationId || !webData.length) return;
    if (isLoadingDocuments) return;

    setIsLoadingDocuments(true);
    const activeAutomation = webData.find(w => w.automationId === selectedAutomationId);
    if (!activeAutomation) { setIsLoadingDocuments(false); return; }

    const docFields = activeAutomation.fields?.filter((f: any) => f.fieldType === 'document') || [];
    const personIds = new Set<string>();
    const companyIds = new Set<string>();
    const requiredKycIds = new Set<string>();

    docFields.forEach((field: any) => {
      const entityId = resolveTargetEntityId(field);
      if (entityId) {
        if (field.entityTypes?.includes('company')) companyIds.add(String(entityId));
        else personIds.add(String(entityId));
        if (field.kycDocumentId) requiredKycIds.add(field.kycDocumentId);
      }
    });

    try {
      const results = [];
      if (personIds.size > 0 && requiredKycIds.size > 0) {
        const { data: personDocs } = await supabase.from('acc_portal_directors_documents')
          .select('*, kyc_document:acc_portal_kyc!document_id(*)')
          .in('director_id', Array.from(personIds)).in('document_id', Array.from(requiredKycIds)).neq('status', 'deleted');
        if (personDocs) results.push(...personDocs.map(d => ({ ...d, owner_type: 'person', owner_id: String(d.director_id) })));
      }

      if (companyIds.size > 0 && requiredKycIds.size > 0) {
        const { data: companyDocs } = await supabase.from('acc_portal_company_documents')
          .select('*, kyc_document:acc_portal_kyc!document_id(*)')
          .in('company_id', Array.from(companyIds)).in('document_id', Array.from(requiredKycIds)).neq('status', 'deleted');
        if (companyDocs) results.push(...companyDocs.map(d => ({ ...d, owner_type: 'company', owner_id: String(d.company_id) })));
      }
      setDocumentFiles(results);
    } catch (err) { console.error("Error fetching documents:", err); } finally { setIsLoadingDocuments(false); }
  }, [selectedAutomationId, webData, resolveTargetEntityId, isOpen]);

  // --- INITIAL DATA FETCH ---
  useEffect(() => {
    if (!isOpen) return;
    const fetchData = async () => {
      setIsLoading(true);
      try {
        const jl = task?.job_level;
        if (!jl) return;
        let query = supabase.from('tm_class_requirements').select('*')
          .eq('job_level->>department_id', String(jl.department_id))
          .eq('job_level->>subdepartment_id', String(jl.subdepartment_id));

        if (jl.class_id) query = query.eq('job_level->>class_id', String(jl.class_id));
        else query = query.is('job_level->>class_id', null);

        if (jl.subclass_id) query = query.eq('job_level->>subclass_id', String(jl.subclass_id));
        else query = query.is('job_level->>subclass_id', null);

        const { data: requirement } = await query.maybeSingle();
        if (!requirement) return;
        setRequirementJobQuestions(requirement.job_specific_questions || []);
        const individualRequirements = requirement.requirements?.filter((req: any) =>
          req.automationId || req.automation_id || req.web_automation?.automationId
        ) || [];

        const globalAutoIds = requirement.web_automation?.map((auto: any) => auto.automationId).filter(Boolean) || [];
        const indivAutoIds = individualRequirements.map((req: any) => req.automationId || req.automation_id || req.web_automation?.automationId).filter(Boolean);
        const allAutomationIds = [...new Set([...globalAutoIds, ...indivAutoIds])];

        let finalWebDataItems: any[] = [];
        let fetchedAutos: any[] = [];

        if (allAutomationIds.length > 0) {
          const { data: autos } = await supabase.from('tm_automations').select('*').in('id', allAutomationIds);
          fetchedAutos = autos || [];
          const globalRefs = requirement.web_automation || [];
          const indivRefs = individualRequirements.map((req: any) => ({
            automationId: req.automationId || req.automation_id || req.web_automation?.automationId,
            documentName: req.name,
            documentId: req.id,
            ...(req.web_automation || {})
          }));

          const allRefs = [...globalRefs, ...indivRefs];
          finalWebDataItems = allRefs.map((ref: any) => {
            const autoDef = fetchedAutos.find(a => a.id === ref.automationId);
            return { ...ref, fields: autoDef?.webdata || [], automationName: autoDef?.name, automation: autoDef };
          }).filter(item => item.automationId);
          setWebData(finalWebDataItems);
        } else { setWebData([]); }

        const mappings = finalWebDataItems.map((item, idx) => ({
          entityKey: `wd-${idx}`, entityName: item.documentName || item.automationName || `Flow ${idx + 1}`,
          entityType: 'webdata', automationId: item.automationId, documentId: item.documentId, automation: item.automation
        }));
        setEntityAutomationMappings(mappings);
        if (mappings.length > 0) {
          if (!selectedAutomationId || !mappings.some(m => m.automationId === selectedAutomationId)) setSelectedAutomationId(mappings[0].automationId);
        } else { setSelectedAutomationId(''); }

        const fieldIds = finalWebDataItems.flatMap(i => {
          const fields = i.fields || [];
          const directIds = fields.flatMap((f: any) =>
            f.linkedMasterFields || f.masterFieldIds || []
          );
          const arrayIds = fields.flatMap((f: any) =>
            (f.arrayItems || []).flatMap((item: any) =>
              item.linkedMasterFields || (item.linkedMasterFieldId ? [item.linkedMasterFieldId] : [])
            )
          );
          return [...directIds, ...arrayIds];
        }).filter(Boolean);

        const uniqueFieldIds = [...new Set(fieldIds)];

        if (uniqueFieldIds.length > 0) {
          const { data: fields } = await supabase.from('tm_job_fields').select('*').in('id', uniqueFieldIds);
          setJobFields(fields?.reduce((acc, f) => ({ ...acc, [f.id.toString()]: f }), {}) || {});
        }
      } catch (error) { console.error('Error in fetchData:', error); } finally { setIsLoading(false); }
    };
    fetchData();
  }, [isOpen, task?.job_level]);

  useEffect(() => {
    if (isOpen && selectedAutomationId && Object.keys(jobFields).length > 0) {
      fetchSourceData();
      fetchDocumentFiles();
    }
  }, [selectedAutomationId, isOpen, fetchSourceData, fetchDocumentFiles]);

  useEffect(() => {
    const runComputation = async () => {
      if (!currentIndividualId || !selectedAutomationId) return;
      const cid = relationshipData?.company?.id || task?.company_id;
      const activeWeb = webData.find(w => w.automationId === selectedAutomationId);

      // Map fields and include the entityType context
      const computedFields = activeWeb?.fields?.filter((f: any) => f.fieldType === 'computed')
        ?.map((f: any) => ({
          variableName: f.variableName,
          computedFunction: f.computedFunction,
          computedDocuments: f.computedDocuments || [],
          // This pulls "principal" or "employee" from the automation config
          entityContext: f.entityTypes?.[0]
        })) || [];

      if (computedFields.length === 0) { setComputedFieldsPreview({}); return; }

      const computedConfigs = activeWeb?.fields?.filter((f: any) => f.fieldType === 'computed') || [];
      for (const f of computedConfigs) {
        const val = await executeComputedField(
          f.computedFunction,
          currentIndividualId,
          f.computedDocuments || [],
          null, // fieldPath
          'latest',
          null, // cache
          null, // arithmetic
          cid,  // PASS TARGET COMPANY
          f.entityTypes?.[0] // PASS ENTITY TYPE (e.g. 'employee')
        );
        formData[f.variableName] = val;
      }

      setIsComputing(true);
      try {
        const results = {};
        for (const config of computedFields) {
          const val = await executeComputedField(
            config.computedFunction,
            currentIndividualId,
            config.computedDocuments,
            null, // fieldPath
            'latest',
            null, // cache
            null, // arithmetic
            cid,
            config.entityContext // PASSING THE CONTEXT HERE
          );
          results[config.variableName] = val;
        }
        setComputedFieldsPreview(results);
      } catch (error) {
        console.error('Error auto-computing fields:', error);
      } finally {
        setIsComputing(false);
      }
    };
    const timer = setTimeout(runComputation, 500);
    return () => clearTimeout(timer);
  }, [currentIndividualId, selectedAutomationId, webData, relationshipData, task]);

  const handleRunAutomation = async () => {
    if (!selectedAutomationId) {
      toast({ title: "Validation Error", description: "Missing automation selection", variant: "destructive" });
      return;
    }

    setIsAutomationRunning(true);
    try {
      const mapping = entityAutomationMappings.find(m => m.automationId === selectedAutomationId);
      if (!mapping?.automation) throw new Error("Automation configuration not found");

      const automation = mapping.automation;
      const automationLogin = automation.login || {};
      const formData: Record<string, any> = {};
      const activeWeb = webData.find(w => w.automationId === selectedAutomationId);

      activeWeb?.fields?.forEach((f: any) => {

        if (f.linkedJobQuestionId) {
          const val = getFieldValue(f.variableName, ""); // entityId not needed for job questions
          formData[f.variableName] = (val === 'Missing' || val === 'Missing Task Data') ? null : val;
          return;
        }

        if (f.fieldType === 'document') {
          const targetId = resolveTargetEntityId(f);
          const doc = documentFiles.find(d => d.document_id === f.kycDocumentId && String(d.owner_id) === String(targetId));
          if (doc) formData[f.variableName] = buildFileUrl(doc);
          return;
        }

        if (f.fieldType === 'computed') return;

        if (f.fieldType === 'array') {
          const entityIds = resolveEntityIdsForArray(f, relationshipData);
          const finalArrayData: any[] = [];

          entityIds.forEach((id: string) => {
            const columnsData = (f.arrayItems || []).map((col: any) => {
              let val: any = '';
              // Handle both linkedMasterFields (array) and linkedMasterFieldId (single value)
              const fieldIds = col.linkedMasterFields || (col.linkedMasterFieldId ? [col.linkedMasterFieldId] : []);
              const fieldId = String(fieldIds[0] || '');

              if (fieldId) {
                const field = jobFields[fieldId];
                if (field?.is_computed || field?.computed_config?.is_computed) {
                  const itemExtractionMode = col.extractionMode || 'latest';
                  const key = `${field.id}_${id}_${itemExtractionMode}`;
                  val = masterFieldComputedValues[key];
                } else if (field?.sources?.[0]) {
                  // Use getFieldValue to properly match entity type with source
                  val = getFieldValue(fieldId, String(id), 0, col.extractionMode || 'latest');
                  if (val === 'Missing' || val === 'Missing Config' || val === 'No Source') val = '';
                }
              }
              return { ...col, value: val, fieldId };
            });

            const maxRows = Math.max(
              1,
              ...columnsData.map((c: any) => Array.isArray(c.value) ? c.value.length : 1)
            );

            for (let i = 0; i < maxRows; i++) {
              const rowObj: Record<string, any> = {};
              columnsData.forEach((col: any) => {
                let v = col.value;
                if (Array.isArray(v)) {
                  v = v[i] !== undefined ? v[i] : "";
                } else {
                  v = v !== undefined && v !== 'Computing...' ? v : "";
                }
                if (col.type === 'date' && v) {
                  v = formatDateValue(v, col.dateFormat);
                }
                rowObj[col.variableName] = v;
              });
              finalArrayData.push(rowObj);
            }
          });

          formData[f.variableName] = finalArrayData;
          return;
        }

        const targetId = resolveTargetEntityId(f);
        const masterIds = f.linkedMasterFields || f.masterFieldIds || [];

        // ============================================================
        // KEY FIX: Use getFieldValue which now properly matches entity types
        // ============================================================
        const values = masterIds.map((mid: string | number) => {
          let val = getFieldValue(String(mid), String(targetId), 0, f.extractionMode || 'latest');

          // Handle Object values preventing [object Object]
          if (typeof val === 'object' && val !== null) {
            // If it's a date object, leave it for formatting
            if (val.day && val.month && val.year) return val;

            // If it's a generic object, try to find a 'name', 'label', or 'value' key
            // Or simply JSON.stringify it so the backend can at least read it
            return val.name || val.label || val.value || JSON.stringify(val);
          }
          if (Array.isArray(val)) {
            val = val.join(', ');
          }
          if (f.fieldType === 'date' && val && val !== 'Missing' && val !== 'Computing...') {
            return formatDateValue(val, f.dateFormat);
          }
          return (val === 'Missing' || val === 'Computing...' || val === 'Missing Config' || val === 'No Source') ? null : val;
        }).filter(Boolean);

        if (values.length > 0) {
          formData[f.variableName] = values.length === 1 ? values[0] : values.join(' ');
        }
      });

      const computedFields = activeWeb?.fields?.filter((f: any) => f.fieldType === 'computed')
        ?.map((f: any) => ({
          variableName: f.variableName,
          computedFunction: f.computedFunction,
          computedDocuments: f.computedDocuments || [],
          entityContext: f.entityTypes?.[0] // Pass entity type
        })) || [];
      if (computedFields.length > 0) {
        const cid = relationshipData?.company?.id || task?.company_id;
        for (const config of computedFields) {
          const val = await executeComputedField(
            config.computedFunction,
            currentIndividualId,
            config.computedDocuments,
            null,
            'latest',
            null,
            null,
            cid,
            config.entityContext // Ensure this matches your computed Function's new signature
          );
          formData[config.variableName] = val;
        }
      }
      const payload = {
        url: automationLogin.url || "https://fns.immigration.go.ke/account/login.html",
        photoPath: "",
        login: { email: automationLogin.email || "", idNumber: automationLogin.idNumber || "", password: automationLogin.password || "" },
        formData: formData, step2Data: {}, step3Data: {}
      };


      const res = await fetch(automation.webhook_url, { method: automation.webhook_method || 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!res.ok) throw new Error("Trigger failed: " + res.status);
      toast({ title: 'Success', description: 'Automation process initiated successfully' });
    } catch (e) {
      console.error("Automation Error:", e);
      toast({ title: 'Automation Error', description: e.message, variant: 'destructive' });
    } finally { setIsAutomationRunning(false); }
  };

  const cancelEditing = () => {
    setEditingCell(null);
    setEditValue('');
  };

  const startEditing = async (fieldId: string, sourceIdx: number, table: string, path: string, val: string, entityId: string, linkingVariable: string, fieldType?: string, computedFunction?: string, masterFieldId?: string | number) => {
    try {
      // For computed fields, we don't need to fetch anything
      if (fieldType === 'computed' || computedFunction) {
        setEditingCell({ fieldId, sourceIdx, table, path, entityId, linkingVariable, fieldType, computedFunction });
        setEditValue(val || '');
        return;
      }

      // For non-computed fields, ensure we have the record in cache
      if (table && entityId) {
        let record = sourceData[table]?.[entityId];
        
        // If record not in cache, fetch it using the correct linking variables from master field sources
        if (!record) {
          let query = supabase
            .from(table)
            .select('*');

          // If we have a master field ID, use its sources to determine the correct linking
          if (masterFieldId) {
            const masterField = jobFields[masterFieldId.toString()];
            if (masterField?.sources?.length) {
              // Find the source that matches our current table
              const source = masterField.sources.find(s => s.table === table);
              if (source?.linking_variable) {
                // Use the linking variable from the master field source
                query = query.eq(source.linking_variable, entityId);
              } else {
                // Fallback to trying common ID fields
                query = query.or(`id.eq.${entityId},director_id.eq.${entityId},company_id.eq.${entityId}`);
              }
            } else {
              // No sources defined, try common ID fields
              query = query.or(`id.eq.${entityId},director_id.eq.${entityId},company_id.eq.${entityId}`);
            }
          } else {
            // No master field ID, try common ID fields
            query = query.or(`id.eq.${entityId},director_id.eq.${entityId},company_id.eq.${entityId}`);
          }

          const { data, error } = await query.maybeSingle();
          if (error) throw error;
          record = data;

          if (record) {
            // Update the cache with the fetched record
            setSourceData(prev => ({
              ...prev,
              [table]: {
                ...(prev[table] || {}),
                [entityId]: record
              }
            }));
          } else {
            throw new Error('Record not found');
          }
        }
      }

      setEditingCell({ fieldId, sourceIdx, table, path, entityId, linkingVariable, fieldType, computedFunction });
      setEditValue(val || '');
    } catch (error) {
      console.error('Error starting edit:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to start editing. The record could not be loaded.',
        variant: 'destructive'
      });
    }
  };

  const saveEdit = async (isDropdown?: boolean, dropdownOptions?: { label: string, value: string }[]) => {
    if (!editingCell) return;
    const { table, path, entityId, fieldType, computedFunction } = editingCell;
    let valueToSave = editValue;

    // Handle dropdown value mapping if needed
    if (isDropdown && dropdownOptions && dropdownOptions.length > 0) {
      const selectedOption = dropdownOptions.find(opt => opt.value === editValue);
      if (selectedOption) {
        valueToSave = selectedOption.label;
      }
    }

    // Special handling for computed fields
    if (fieldType === 'computed' || computedFunction) {
      // For computed fields, just update the preview and local state
      setComputedFieldsPreview(prev => ({
        ...prev,
        [editingCell.fieldId]: valueToSave
      }));
      
      // Also update the form data if needed
      if (formData) {
        setFormData((prev: any) => ({
          ...prev,
          [editingCell.fieldId]: valueToSave
        }));
      }
      
      setEditingCell(null);
      setEditValue('');
      return;
    }

    // For non-computed fields, proceed with database update
    if (!table || !path) {
      console.error('Missing table or path for non-computed field');
      toast({
        title: 'Error',
        description: 'Missing required field information',
        variant: 'destructive'
      });
      return;
    }

    setIsLoadingData(true);
    try {
      // Try to get the record from cache first
      let record = sourceData[table]?.[entityId];
      let recordPK = entityId;
      let queryField = 'id';

      // If not in cache, try to fetch it
      if (!record) {
        // First try with the entityId as the primary key
        const { data: fetchedRecord, error: fetchError } = await supabase
          .from(table)
          .select('*')
          .eq('id', entityId)
          .maybeSingle();

        if (fetchError) throw fetchError;

        // If not found, try with other possible ID fields
        if (!fetchedRecord) {
          const { data: altRecord, error: altError } = await supabase
            .from(table)
            .select('*')
            .or(`director_id.eq.${entityId},company_id.eq.${entityId}`)
            .maybeSingle();

          if (altError) throw altError;
          if (!altRecord) {
            throw new Error(`Record not found in table ${table} with ID ${entityId}`);
          }
          record = altRecord;
        } else {
          record = fetchedRecord;
        }

        // Update the cache
        setSourceData(prev => ({
          ...prev,
          [table]: {
            ...(prev[table] || {}),
            [entityId]: record
          }
        }));
      }

      // Determine the primary key field
      if (record.director_id) {
        queryField = 'director_id';
        recordPK = record.director_id;
      } else if (record.company_id) {
        queryField = 'company_id';
        recordPK = record.company_id;
      } else if (record.id) {
        queryField = 'id';
        recordPK = record.id;
      }

      // Get the latest record to avoid conflicts
      const { data: existing, error: fetchError } = await supabase
        .from(table)
        .select('*')
        .eq(queryField, recordPK)
        .single();

      if (fetchError) throw fetchError;
      if (!existing) {
        throw new Error(`Record not found in database: ${recordPK}`);
      }

      // Update the record with the new value
      const updated = updateJsonValue(existing, path, valueToSave);

      // Save the changes
      const { data: updatedRecord, error: updateError } = await supabase
        .from(table)
        .update({ ...updated, updated_at: new Date().toISOString() })
        .eq(queryField, recordPK)
        .select()
        .single();

      if (updateError) throw updateError;

      // Update the cache
      if (updatedRecord) {
        setSourceData(prev => ({
          ...prev,
          [table]: {
            ...(prev[table] || {}),
            [entityId]: updatedRecord
          }
        }));

        toast({ 
          title: 'Success', 
          description: 'Field updated successfully',
          variant: 'default'
        });
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

  // --- FIXED: Helper to get dependent dropdown options using VALUE not LABEL ---
  const getDependentDropdownOptions = useCallback((field: any, linkedJobField: any, targetId: string) => {
    const opts = linkedJobField?.options;

    if (!opts?.isDependencyConfig) {
      if (Array.isArray(opts)) {
        return opts.map((o: any) => typeof o === 'string' ? { label: o, value: o } : o);
      }
      return [];
    }

    const parentFieldId = opts.dependencyConfig?.dependentFieldId;

    if (!parentFieldId) {
      return [];
    }

    const parentField = jobFields[parentFieldId];
    if (!parentField) {
      return [];
    }

    let entityCategory = 'individual';
    if (field.entityTypes?.includes('company')) {
      entityCategory = 'company';
    }

    let sourceIdx = parentField.sources?.findIndex((s: any) => s.source_type === entityCategory);
    if (sourceIdx === -1 || sourceIdx === undefined) sourceIdx = 0;

    const parentLabelValue = getFieldValue(String(parentFieldId), String(targetId), sourceIdx);
    let parentValueForMapping = parentLabelValue;

    const parentFieldOptions = parentField.options;
    if (Array.isArray(parentFieldOptions) && parentLabelValue && parentLabelValue !== 'Missing' && parentLabelValue !== 'Computing...') {
      const matchingParentOption = parentFieldOptions.find((opt: any) => {
        const optLabel = typeof opt === 'string' ? opt : opt.label;
        return optLabel === parentLabelValue;
      });

      if (matchingParentOption) {
        parentValueForMapping = typeof matchingParentOption === 'string'
          ? matchingParentOption
          : matchingParentOption.value;
      }
    }

    if (!parentValueForMapping || parentValueForMapping === 'Missing' || parentValueForMapping === 'Computing...') {
      return [];
    }

    const availableOptions = opts.manualMapping?.[parentValueForMapping] || [];

    return availableOptions;
  }, [jobFields, getFieldValue]);

  const renderFieldsTable = () => {
    if (!activeWebEntry?.fields || activeWebEntry.fields.length === 0) {
      return <div className="p-12 text-center text-slate-400 text-sm">No fields configured for this automation.</div>;
    }

    // 1. PRE-PROCESS FIELDS (Calculate missing status for sorting)
    const processedFields = activeWebEntry.fields.map(field => {
      let isMissing = false;
      const targetId = resolveTargetEntityId(field);

      if (field.fieldType === 'array') {
        const entityIds = resolveEntityIdsForArray(field, relationshipData);
        if (entityIds.length === 0) isMissing = true;
      } else if (field.fieldType === 'document') {
        const foundDoc = documentFiles.find(d => d.document_id === field.kycDocumentId && String(d.owner_id) === String(targetId));
        if (!foundDoc) isMissing = true;
      } else if (field.fieldType === 'computed') {
        const val = computedFieldsPreview[field.variableName];
        if (!val || val === 'Pending...' || val === 'Missing' || val === '') isMissing = true;
      } else if (field.linkedJobQuestionId) {
        const val = getFieldValue(field.variableName, "");
        if (!val || val === 'Missing' || val === 'Missing Task Data') isMissing = true;
      } else {
        const masterIds = field.linkedMasterFields || field.masterFieldIds || [];
        const mergedValue = masterIds.map((mid: string | number) => {
          const v = getFieldValue(String(mid), String(targetId), 0, field.extractionMode || 'latest');
          return Array.isArray(v) ? v.join(', ') : v;
        }).join(' ').trim();
        if (!mergedValue || mergedValue === 'Missing' || mergedValue === 'Missing Config' || mergedValue === 'No Source') isMissing = true;
      }
      return { ...field, isMissing };
    });

    const sortedFields = sortMissingFirst
      ? [...processedFields].sort((a, b) => (a.isMissing === b.isMissing ? 0 : a.isMissing ? -1 : 1))
      : processedFields;

    return (
      <div className="flex flex-col h-full">
        {/* STATS & FILTER BAR */}
        <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-slate-200">
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-slate-600">{processedFields.length} Fields Total</span>
            {processedFields.filter(f => f.isMissing).length > 0 && (
              <Badge variant="destructive" className="h-6 px-2 text-xs">
                {processedFields.filter(f => f.isMissing).length} Missing
              </Badge>
            )}
          </div>
          <Button variant={sortMissingFirst ? "default" : "outline"} size="sm" onClick={() => setSortMissingFirst(!sortMissingFirst)} className="h-8 text-xs">
            <Filter className="h-3 w-3 mr-2" />
            {sortMissingFirst ? "Show All" : "Show Missing First"}
          </Button>
        </div>

        <div className="flex-1 overflow-hidden bg-white">
          <ScrollArea className="h-full">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-slate-100 border-b-2 border-slate-300">
                <TableRow>
                  <TableHead className="w-12 px-2 py-3 text-center text-xs font-bold text-slate-600 border-r border-slate-200">#</TableHead>
                  <TableHead className="w-80 px-4 py-3 text-left text-xs font-bold text-slate-700 border-r border-slate-200">FIELD NAME</TableHead>
                  <TableHead className="px-4 py-3 text-left text-xs font-bold text-slate-700">SOURCE</TableHead>
                  <TableHead className="px-4 py-3 text-left text-xs font-bold text-slate-700 border-r border-slate-200">CURRENT VALUE</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {sortedFields.map((field, fIdx) => {
                  const isEditing = editingCell?.fieldId === field.variableName;
                  const isJobQuestion = !!field.linkedJobQuestionId;
                  const targetId = resolveTargetEntityId(field);
                  const entityCategory = field.entityTypes?.includes('company') ? 'company' : 'individual';
                  const targetCompanyId = String(relationshipData?.company?.id || task?.company_id);
                  // --- DATA RESOLUTION ---
                  let persistenceSource = null;
                  let mergedValue = "";
                  let isDropdown = false;
                  let dropdownOptions = [];
                  let masterFieldDef = null;

                  if (field.fieldType === 'computed') {
                    mergedValue = computedFieldsPreview[field.variableName] || "";
                    const mappingKey = field.computedFunction === 'extractCurrentJobTitle' ? 'job_title' :
                      field.computedFunction === 'extractCurrentJobDescription' ? 'job_description' : null;

                    if (mappingKey) {
                      masterFieldDef = Object.values(jobFields).find(jf => jf.field_key === mappingKey);
                      // Find the source matching the entity category (Individual vs Company)
                      persistenceSource = masterFieldDef?.sources?.find(s => s.source_type === entityCategory) || masterFieldDef?.sources?.[0];
                    }
                  }
                  else if (isJobQuestion) {
                    mergedValue = getFieldValue(field.variableName, String(targetId));
                    persistenceSource = { table: 'tm_tasks', path: `job_specific_answers->>'${field.linkedJobQuestionId}'`, linking_variable: 'id' };
                    const qDef = requirementJobQuestions.find(q => String(q.id) === String(field.linkedJobQuestionId));
                    if (qDef?.type === 'select') {
                      isDropdown = true;
                      dropdownOptions = (qDef.options || []).map(opt => ({ label: opt, value: opt }));
                    }
                  }
                  else {
                    const masterIds = field.linkedMasterFields || field.masterFieldIds || [];
                    masterFieldDef = jobFields[masterIds[0]];
                    mergedValue = masterIds.map(mid => getFieldValue(String(mid), String(targetId), 0, field.extractionMode)).join(' ').trim();
                    persistenceSource = masterFieldDef?.sources?.find(s => s.source_type === entityCategory) || masterFieldDef?.sources?.[0];

                    // DROPDOWN LOGIC
                    if (masterFieldDef?.type === 'select') {
                      isDropdown = true;
                      const opts = masterFieldDef.options;
                      if (opts?.isDependencyConfig) {
                        // Dependent logic (e.g. County -> Sub County)
                        dropdownOptions = getDependentDropdownOptions(field, masterFieldDef, String(targetId));
                      } else if (Array.isArray(opts)) {
                        // Standard logic
                        dropdownOptions = opts.map(o => typeof o === 'string' ? { label: o, value: o } : o);
                      }
                    }
                  }

                  // Helper to get display label for dropdowns
                  const getDisplayValue = (val: string) => {
                    if (!isDropdown) return val;
                    const option = dropdownOptions.find(o => String(o.value) === String(val) || o.label === val);
                    return option ? option.label : val;
                  };

                  const isEditable = !!persistenceSource;
                  const isValueMissing = !mergedValue || mergedValue === 'Missing' || mergedValue === 'Pending...';

                   // CASE: ARRAY FIELDS
                   if (field.fieldType === 'array') {
                    const entityIds = resolveEntityIdsForArray(field, relationshipData);
                    const isExpanded = expandedArrayFields.has(field.variableName);
                    const arrayData = getArrayFieldData(field);

                    return (
                      <React.Fragment key={fIdx}>
                        <TableRow className="group border-b border-slate-200 bg-blue-50/20">
                          <TableCell className="px-2 py-2 text-center text-xs font-mono text-slate-400 border-r border-slate-100 bg-slate-50">
                            {fIdx + 1}
                          </TableCell>
                          <TableCell className="px-4 py-2 border-r border-slate-100">
                            <div className="flex items-center gap-2">
                              <button onClick={() => toggleArrayFieldExpansion(field.variableName)} className="flex items-center gap-1 hover:bg-blue-100 rounded px-2 py-1 transition-colors">
                                <ChevronRight className={`h-4 w-4 text-blue-600 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                                <List className="h-4 w-4 text-blue-600" />
                              </button>
                              <span className="text-sm font-semibold text-slate-900">{field.efnsDisplayName || field.variableName}</span>
                              <Badge variant="outline" className="text-[10px] border-blue-300 text-blue-700 bg-blue-50">Array</Badge>
                            </div>
                          </TableCell>
                          <TableCell className="px-4 py-2 border-r border-slate-100">
                            <span className="text-xs text-slate-600">{entityIds.length} entities • {field.arrayItems?.length || 0} columns</span>
                          </TableCell>
                          <TableCell className="px-4 py-2">
                            <button onClick={() => toggleArrayFieldExpansion(field.variableName)} className="text-xs text-blue-600 hover:text-blue-800 hover:underline italic">
                              {isExpanded ? 'Hide details' : 'View full details'}
                            </button>
                          </TableCell>
                        </TableRow>

                        {isExpanded && (
                          <TableRow>
                            <TableCell colSpan={4} className="p-0 bg-gradient-to-r from-blue-50/50 to-indigo-50/50 border-b-2 border-blue-300">
                              {/* ... Array Table rendering logic ... */}
                              <div className="p-6">
                                <div className="border-2 border-blue-300 rounded-lg overflow-hidden shadow-sm">
                                    <Table>
                                      <TableHeader className="bg-gradient-to-r from-blue-100 to-indigo-100 border-b-2 border-blue-300">
                                        <TableRow>
                                          <TableHead className="px-4 py-3 text-left text-xs font-bold text-slate-800 border-r-2 border-blue-200 bg-blue-50/50 w-16">#</TableHead>
                                          {field.arrayItems?.map((item: any, idx: number) => (
                                            <TableHead key={idx} className={cn("px-4 py-3 text-left text-xs font-bold text-slate-800", idx < field.arrayItems.length - 1 && "border-r-2 border-blue-200")}>
                                              <span>{item.name || item.header || getMasterFieldDisplayName((item.linkedMasterFields || [])[0] || item.linkedMasterFieldId)}</span>
                                            </TableHead>
                                          ))}
                                        </TableRow>
                                      </TableHeader>
                                      <TableBody className="bg-white">
                                        {arrayData.map((row: any, rowIndex: number) => (
                                          <TableRow key={rowIndex} className="border-b border-blue-200 last:border-b-0 hover:bg-blue-50/30">
                                            <TableCell className="px-4 py-3 text-xs font-semibold text-slate-600 border-r-2 border-blue-200 bg-blue-50/30">{row.index}</TableCell>
                                            {field.arrayItems?.map((item: any, colIndex: number) => {
                                              const columnKey = item.variableName || String((item.linkedMasterFields || [])[0] || item.linkedMasterFieldId || '');
                                              const value = row[columnKey];
                                              return (
                                                <TableCell key={colIndex} className={cn("px-4 py-3 text-xs", colIndex < field.arrayItems.length - 1 && "border-r-2 border-blue-100", (!value) ? "text-red-600 font-medium" : "text-slate-800")}>
                                                  {value || "Missing"}
                                                </TableCell>
                                              );
                                            })}
                                          </TableRow>
                                        ))}
                                      </TableBody>
                                    </Table>
                                </div>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </React.Fragment>
                    );
                  }

                  // CASE: DOCUMENT FIELDS
                  if (field.fieldType === 'document') {
                    const targetId = resolveTargetEntityId(field);
                    const foundDoc = documentFiles.find(d => d.document_id === field.kycDocumentId && String(d.owner_id) === String(targetId));

                    return (
                      <TableRow key={fIdx} className="group border-b border-slate-200">
                        <TableCell className="px-2 py-2 text-center text-xs font-mono text-slate-400 border-r border-slate-100 bg-slate-50">{fIdx + 1}</TableCell>
                        <TableCell className="px-4 py-2 border-r border-slate-100">
                          <div className="flex items-center gap-2">
                            <Paperclip className="h-4 w-4 text-amber-600" />
                            <span className="text-sm font-semibold text-slate-900">{field.efnsDisplayName || field.variableName}</span>
                            <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-700 bg-amber-50">Document</Badge>
                          </div>
                        </TableCell>
                        <TableCell className="px-4 py-2 border-r border-slate-100">
                          {foundDoc ? <Badge className="bg-green-600 text-white h-6">Available</Badge> : <Badge variant="destructive" className="h-6">Missing</Badge>}
                        </TableCell>
                        <TableCell className="px-4 py-2">
                          <span className="text-xs text-slate-500">KYC: {field.kycDocumentId?.substring(0, 12)}...</span>
                        </TableCell>
                      </TableRow>
                    );
                  }

                  return (
                    <TableRow key={fIdx} className={cn("group border-b border-slate-200 transition-colors", isEditing ? "bg-blue-50/50" : (field.fieldType === 'computed' ? "bg-purple-50/10" : "hover:bg-blue-50"))}>
                      <TableCell className="px-2 py-2 text-center text-xs font-mono text-slate-400 border-r border-slate-100 bg-slate-50">{fIdx + 1}</TableCell>
                      <TableCell className="px-4 py-2 border-r border-slate-100">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-slate-900">{field.efnsDisplayName || field.variableName}</span>
                          {field.fieldType === 'computed' && <Badge variant="outline" className="text-[10px] border-purple-300 text-purple-700 bg-purple-50">Computed</Badge>}
                          {isEditable && <Badge variant="outline" className="text-[10px] border-blue-300 text-blue-700 bg-blue-50">Editable</Badge>}
                          {isValueMissing && <AlertCircle className="h-3.5 w-3.5 text-red-500" />}
                        </div>
                      </TableCell>

                      <TableCell className="px-4 py-2 text-xs text-slate-600">
                        {isJobQuestion ? (
                          <div className="font-mono text-[10px] bg-purple-100 text-purple-700 p-1 rounded inline-flex items-center"><HelpCircle className="h-3 w-3 mr-1" /> Job Question</div>
                        ) : persistenceSource ? (
                          <TooltipProvider delayDuration={150}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className="font-mono text-[10px] bg-slate-100 p-1 rounded inline-flex items-center cursor-help">
                                  <Database className="h-3 w-3 mr-1 text-blue-500" />
                                  {persistenceSource.table?.replace('acc_portal_', '').substring(0, 15)}...
                                </div>
                              </TooltipTrigger>
                              <TooltipContent className="text-xs bg-slate-800 text-white">
                                <p className="font-bold mb-1">Entity Category: {persistenceSource.source_type}</p>
                                <p>Table: {persistenceSource.table}</p>
                                <p>Path: {persistenceSource.path}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        ) : <div className="text-xs text-slate-400 italic">No Source Map</div>}
                      </TableCell>

                      <TableCell className="px-4 py-1 border-r border-slate-100 h-full">
                        {isEditing ? (
                          <div className="flex items-center gap-2">
                            {isDropdown ? (
                              <Select value={editValue} onValueChange={setEditValue}>
                                <SelectTrigger className="h-8 text-sm border-blue-400"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  {dropdownOptions.map((opt, i) => (
                                    <SelectItem key={`${opt.value}-${i}`} value={String(opt.value)}>{opt.label}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : (
                              <Input autoFocus value={editValue} onChange={e => setEditValue(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') saveEdit(isDropdown, dropdownOptions); if (e.key === 'Escape') cancelEditing(); }} className="h-8 text-sm border-blue-400" />
                            )}
                            <Button size="icon" onClick={() => saveEdit(isDropdown, dropdownOptions)} className="h-8 w-8 bg-green-600 hover:bg-green-700"><Check className="h-4 w-4" /></Button>
                            <Button size="icon" variant="ghost" onClick={cancelEditing} className="h-8 w-8 text-red-500"><X className="h-4 w-4" /></Button>
                          </div>
                        ) : (
                          <div
                            className={cn(
                              "text-sm h-7 flex items-center px-2 rounded -my-1 transition-colors relative",
                              isEditable ? "cursor-pointer border border-transparent hover:border-blue-400 hover:bg-blue-50" : "cursor-default",
                              isValueMissing ? "text-red-600 font-medium italic" : "text-slate-900"
                            )}
                            onClick={() => {
                              if (!isEditable) return;
                      
                              let finalPath = persistenceSource.path || '';
                              let idToUse = (persistenceSource.table === 'tm_tasks') ? taskId : targetId;
                      
                              // --- DYNAMIC ARRAY INDEX RESOLUTION ---
                              if (persistenceSource.table === 'registry_individuals' && finalPath.includes('associations')) {
                                const record = sourceData['registry_individuals']?.[targetId];
                                const associations = record?.employment_data?.associations || [];
                                const targetRegistryType = mapEntityTypeToRegistry(entityCategory);
                      
                                // Find index matching BOTH the Individual Type (Principal/Employee) and the Company ID
                                const assocIdx = associations.findIndex(a => 
                                  String(a.individual_type).toLowerCase() === targetRegistryType.toLowerCase() &&
                                  String(a.company_id) === targetCompanyId
                                );
                      
                                if (assocIdx !== -1) {
                                  /** 
                                   * Transform generic path: 
                                   * "employment_data->>'associations[].job[].title'" 
                                   * to: 
                                   * "employment_data->>associations.0.job.title"
                                   */
                                  const rawPath = finalPath.includes('->>') ? finalPath.split('->>')[1] : finalPath;
                                  const column = finalPath.includes('->>') ? finalPath.split('->>')[0] : '';
                                  
                                  const resolvedJsonPath = rawPath
                                    .replace(/['"]/g, '')       // Remove quotes
                                    .replace('associations[]', `associations.${assocIdx}`)
                                    .replace('job[]', 'job');   // Flatten the job[] template to job object
                                  
                                  finalPath = column ? `${column}->>${resolvedJsonPath}` : resolvedJsonPath;
                                  
                                  console.log(`[Persistence] Targeted Index: ${assocIdx} | Entity: ${targetRegistryType} | Path: ${finalPath}`);
                                }
                              }
                      
                              startEditing(
                                field.variableName,
                                0,
                                persistenceSource.table,
                                finalPath, // Use the resolved path
                                mergedValue,
                                String(idToUse),
                                persistenceSource.linking_variable || 'id',
                                field.fieldType,
                                field.computedFunction
                              );
                            }}
                      
                          >
                            {isComputing ? <Loader2 className="h-3 w-3 animate-spin mr-2" /> : getDisplayValue(mergedValue)}
                            {isEditable && !isEditing && <Edit3 className="h-3 w-3 ml-auto text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity absolute right-2" />}
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </ScrollArea>
        </div>
      </div>
    );
  };

  const renderDocumentsSection = () => {
    const docFields = activeWebEntry?.fields?.filter((f: any) => f.fieldType === 'document') || [];
    if (docFields.length === 0) return <div className="p-12 text-center text-slate-400">No document assets configured.</div>;
    return (
      <div className="grid grid-cols-2 gap-4">
        {docFields.map((req, idx) => {
          const targetId = resolveTargetEntityId(req);
          const foundDoc = documentFiles.find(d => d.document_id === req.kycDocumentId && String(d.owner_id) === String(targetId));
          return (
            <Card key={idx} className={cn("overflow-hidden border transition-all", foundDoc ? "border-green-200 shadow-sm" : "border-red-200 bg-red-50/10")}>
              <CardContent className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={cn("p-2 rounded-lg", foundDoc ? "bg-green-100 text-green-600" : "bg-red-100 text-red-600")}><Paperclip className="h-4 w-4" /></div>
                  <div>
                    <h4 className="font-bold text-sm text-slate-900">{req.efnsDisplayName || req.variableName}</h4>
                    <p className="text-[10px] text-slate-500">Target: {req.variableName}</p>
                  </div>
                </div>
                {foundDoc ? <Badge className="bg-green-600">Ready</Badge> : <Badge variant="destructive">Missing</Badge>}
              </CardContent>
            </Card>
          )
        })}
      </div>
    )
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-[95vw] w-[1400px] h-[90vh] flex flex-col p-0 overflow-hidden border-none shadow-2xl bg-white">
        <div className="p-5 border-b bg-gradient-to-r from-blue-600 to-blue-500 flex items-center justify-between shadow-lg">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 bg-white/20 rounded-xl flex items-center justify-center text-white backdrop-blur">
              <Zap className="h-6 w-6 fill-white" />
            </div>
            <div>
              <DialogTitle className="text-2xl font-black text-white tracking-tight">Data Mapping</DialogTitle>
              <div className="flex items-center gap-2 text-white/80 text-sm mt-0.5">
                <span>Task #{task?.id}</span>
                <span>•</span>
                <span>{task?.applicant_name}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Select value={selectedAutomationId} onValueChange={setSelectedAutomationId}>
              <SelectTrigger className="w-[250px] bg-white/10 border-white/20 text-white h-10">
                <SelectValue placeholder="Select Workflow" />
              </SelectTrigger>
              <SelectContent>
                {entityAutomationMappings.length > 0 ? (
                  entityAutomationMappings.map(m => (
                    <SelectItem key={m.automationId} value={m.automationId}>
                      {m.automation?.name || "Unnamed Flow"}
                    </SelectItem>
                  ))
                ) : (
                  <div className="p-2 text-xs text-slate-400 italic text-center">No workflows found</div>
                )}
              </SelectContent>
            </Select>

            <div className="h-10 w-px bg-white/20" />

            <div className="flex items-center gap-2 bg-white/10 backdrop-blur px-3 py-2 rounded-lg border border-white/20">
              <User className="h-4 w-4 text-white" />
              <input
                value={currentIndividualId}
                onChange={(e) => setCurrentIndividualId(e.target.value)}
                placeholder="ID Number..."
                className="w-28 outline-none text-sm font-semibold text-white bg-transparent placeholder:text-white/50"
              />
            </div>
          </div>
        </div>

        <div className="flex-1 flex flex-col overflow-hidden">
          {!selectedAutomationId ? (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-300">
              <Webhook className="h-16 w-16 mb-4 opacity-20" />
              <p className="text-lg font-medium">Select a workflow to begin</p>
            </div>
          ) : (
            <>
              <div className="px-6 py-3 bg-slate-50 border-b flex items-center justify-between">
                <Tabs value={activeTab} onValueChange={setActiveTab}>
                  <TabsList className="bg-white border border-slate-200 h-9">
                    <TabsTrigger value="fields" className="text-xs"><Database className="h-3 w-3 mr-2" />Fields</TabsTrigger>
                    <TabsTrigger value="documents" className="text-xs"><FileText className="h-3 w-3 mr-2" />Documents</TabsTrigger>
                  </TabsList>
                </Tabs>
                {isLoadingData && (
                  <div className="flex items-center gap-2 text-sm text-slate-500">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading data...
                  </div>
                )}
              </div>

              <div className="flex-1 overflow-hidden">
                <Tabs value={activeTab} className="h-full">
                  <TabsContent value="fields" className="h-full m-0">
                    {renderFieldsTable()}
                  </TabsContent>
                  <TabsContent value="documents" className="h-full p-6 overflow-auto">
                    {renderDocumentsSection()}
                  </TabsContent>
                </Tabs>
              </div>
            </>
          )}
        </div>

        <div className="p-4 border-t bg-slate-50 flex justify-between items-center">
          <Button variant="outline" onClick={onClose} className="h-10">
            Close
          </Button>
          <Button
            onClick={handleRunAutomation}
            disabled={isAutomationRunning}
            className="bg-blue-600 hover:bg-blue-700 h-10 px-6 gap-2"
          >
            {isAutomationRunning ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Zap className="h-4 w-4 fill-white" />
            )}
            Execute Workflow
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};