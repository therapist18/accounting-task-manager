// @ts-nocheck
"use client"

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Loader2, Zap, User, Database, FileText,
  Settings, Webhook, ChevronRight, AlertCircle,
  CheckCircle2, Edit3, X, Save, Calculator,
  FunctionSquare, ExternalLink, Paperclip, AlertTriangle,
  ArrowUpDown, Filter, Check, List, ChevronDown,
  HelpCircle, Eye, Download
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
import { ExtractionPreview } from "@/components/ExtractionPreview"
import { ENTITY_TYPES, type EntityType } from "@/lib/constants/entity-types";

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
}

interface EntityAutomationMapping {
  entityKey: string;
  entityName: string;
  entityType: string;
  automationId: string;
  documentId?: string;
  automation?: any;
}

// ... (Utils remain unchanged)
const parseJsonValue = (data: any, path: string, extractionMode?: 'latest' | 'all'): any => {
  if (!data || !path) return undefined;
  if (path.includes('->>') || path.includes('->')) {
    const parts = path.split(/(->>|->)/);
    const column = parts[0].trim().replace(/['"]/g, '');
    const jsonPath = parts[2].trim().replace(/['"]/g, '');
    const jsonData = data[column];
    if (jsonData === undefined || jsonData === null) return undefined;
    if (jsonPath.includes('[]')) {
      const [arrayPath, ...fieldPathParts] = jsonPath.split('[]');
      const fieldPath = fieldPathParts.join('').replace(/^\./, ''); // Remove leading dot
      const arrayData = arrayPath.split('.').reduce((acc, key) => {
        if (key === '' || key === '[]') return acc;
        return (acc && typeof acc === 'object') ? acc[key] : undefined;
      }, jsonData);
      if (Array.isArray(arrayData)) {
        if (fieldPath) {
          // Extract the field from all array items
          const values = arrayData.map((item, index) => {
            const value = fieldPath.split('.').reduce((acc, key) => (acc && typeof acc === 'object') ? acc[key] : undefined, item);
            return { value, item, index };
          }).filter(({ value }) => value !== undefined && value !== null && value !== '');
          if (extractionMode === 'latest' && values.length > 1) {
            const sortedValues = sortArrayItemsByDate(values, fieldPath);
            return sortedValues.length > 0 ? String(sortedValues[0].value) : undefined;
          }

          const finalValues = values.map(v => v.value);
          return finalValues.length > 0 ? finalValues.join(', ') : undefined;
        } else {
          if (extractionMode === 'latest' && arrayData.length > 1) {
            const sortedArray = sortArrayItemsByDate(arrayData.map((item, index) => ({ value: item, item, index })));
            return sortedArray.length > 0 ? sortedArray[0].value : arrayData;
          }
          return arrayData;
        }
      }
      return undefined;
    }

    return jsonPath.split('.').reduce((acc, key) => (acc && typeof acc === 'object') ? acc[key] : undefined, jsonData);
  }
  return path.split('.').reduce((acc, key) => (acc && typeof acc === 'object') ? acc[key] : undefined, data);
};

const sortArrayItemsByDate = <T extends { value: any; item: any; index: number }>(items: T, fieldPath?: string): T => {
  const dateFields = ['end_date', 'start_date', 'date', 'created_at', 'updated_at'];
  return items.sort((a, b) => {
    const itemA = a.item;
    const itemB = b.item;
    for (const dateField of dateFields) {
      const dateA = itemA[dateField];
      const dateB = itemB[dateField];
      if (dateA && dateB) {
        try {
          const parsedDateA = new Date(dateA);
          const parsedDateB = new Date(dateB);
          if (!isNaN(parsedDateA.getTime()) && !isNaN(parsedDateB.getTime())) {
            return parsedDateB.getTime() - parsedDateA.getTime();
          }
        } catch (e) { }
      }
    }
    return a.index - b.index;
  });
};

const updateJsonValue = (existingData: any, path: string, newValue: any): any => {
  if (!path) return { [path]: newValue };
  if (path.includes('->>') || path.includes('->')) {
    const parts = path.split(/(->>|->)/);
    const column = parts[0].trim().replace(/['"]/g, '');
    const jsonPath = parts[2].trim().replace(/['"]/g, '');
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
  const entityConfig = ENTITY_TYPES.find(et => et.value === type?.toLowerCase());
  return entityConfig?.label || 'Principal';
};

// Helper function to clean object strings and prevent "[object Object]" issues
const cleanFieldValue = (value: any): string => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') {
    // Check for object string representation
    if (value === '[object Object]' || value.startsWith('[object ')) {
      return '';
    }
    // Return empty string for actual empty values, but "Missing" for invalid object strings
    if (value === '') return '';
    return value;
  }
  if (typeof value === 'object') {
    // Convert object to string representation, but avoid "[object Object]"
    try {
      const str = JSON.stringify(value);
      return str === '{}' ? '' : str;
    } catch {
      return '';
    }
  }
  return String(value);
};

// Helper function for display purposes (shows "Missing" in UI)
const cleanFieldValueForDisplay = (value: any): string => {
  if (value === null || value === undefined) return 'Missing';

  if (typeof value === 'string') {
    // Check for object string representation
    if (value === '[object Object]' || value.startsWith('[object ')) {
      return 'Missing';
    }
    // Return empty string for actual empty values, but "Missing" for invalid object strings
    if (value === '') return 'Missing'; // Changed to return Missing for empty strings too if desired, or keep as ''
    return value;
  }

  if (typeof value === 'object') {
    // Convert object to string representation, but avoid "[object Object]"
    try {
      const str = JSON.stringify(value);
      return str === '{}' ? 'Missing' : str;
    } catch {
      return 'Missing';
    }
  }
  return String(value);
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
  relationshipData,
  refreshDocuments
}: AutomationMappingDialogProps) => {
  useEffect(() => {
    if (isOpen && relationshipData) {
      console.log('👤 [Entity Debug] Relationship Data Source:', {
        principal: relationshipData.principal?.id,
        dependants: relationshipData.dependants?.map(d => ({ id: d.id, rel: d.relationship })),
        directors: relationshipData.directors?.map(d => d.id),
        sponsor: relationshipData.sponsor?.id,
        company: relationshipData.company?.id
      });
    }
  }, [isOpen, relationshipData]);
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
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [previewingDocuments, setPreviewingDocuments] = useState<any>(null);
  const lastFetchKey = React.useRef<string>('');
  const isFetchingRef = React.useRef(false);
  const [requirementJobQuestions, setRequirementJobQuestions] = useState<any[]>([]);
  const [individualName, setIndividualName] = useState<string>('');

  // Helper functions for document preview (moved inside component)
  const getFileUrl = (filePath: string) => {
    if (!filePath) return '';

    // If it's already a full URL, return as is
    if (filePath.startsWith('http')) return filePath;

    const bucketName = 'kyc-documents';
    let cleanPath = filePath;

    // Ensure file path doesn't start with bucket name (avoid double prefix)
    if (cleanPath.startsWith(bucketName + '/')) {
      cleanPath = cleanPath.substring(bucketName.length + 1);
    }

    // Construct full path
    const fullPath = `${bucketName}/${cleanPath}`;

    // Build complete URL
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!supabaseUrl) {
      console.error('NEXT_PUBLIC_SUPABASE_URL environment variable is not set');
      return '';
    }

    // Use encodeURI for the entire path to handle spaces properly
    const encodedPath = encodeURI(fullPath);
    return `${supabaseUrl}/storage/v1/object/public/${encodedPath}`;
  };

  const handlePreviewDocument = async (doc: any) => {
    if (!doc) return;

    // Set preview data with document and its extracted details
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

    // Update the specific document's extracted details
    const updatedDocuments = previewingDocuments.documents.map((doc: any) => {
      if (doc.id === docId || doc.id === `doc-${docId}` || doc.file_path === docId) {
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
      // Save the edited details to the database
      const { error } = await supabase
        .from('acc_portal_directors_documents')
        .update({
          edited_details: editedData,
          updated_at: new Date().toISOString()
        })
        .eq('id', doc.id);

      if (error) throw error;

      toast.success('Document details updated successfully');

      // Update local state
      const updatedDocuments = previewingDocuments.documents.map((d: any) =>
        d.id === doc.id ? { ...d, edited_details } : d
      );

      setPreviewingDocuments({
        ...previewingDocuments,
        documents: updatedDocuments
      });

      // Call refresh callback if provided to update parent table states
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
    const encodedPath = encodeURI(fullPath);
    return `${supabaseUrl}/storage/v1/object/public/${encodedPath}`;
  };

  const resolveTargetEntityId = useCallback((field: any) => {
    const types = field.entityTypes || [];

    // 1. Try Dependant
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
      // If 'dependant' was requested but not found, do not fall through to others
      // unless other types are explicitly in the 'types' array
    }

    // 2. Try Sponsor
    if (types.includes('sponsor') && relationshipData?.sponsor?.id) {
      return relationshipData.sponsor.id;
    }

    // 3. Try Director
    if (types.includes('director') && relationshipData?.directors?.[0]?.id) {
      return relationshipData.directors[0].id;
    }

    // 4. Try Understudy
    if (types.includes('understudy') && relationshipData?.understudy?.id) {
      return relationshipData.understudy.id;
    }

    // 5. Try Principal (Only if explicitly requested in types)
    if (types.includes('principal')) {
      const pid = relationshipData?.principal?.id || currentIndividualId;
      if (pid) return pid;
    }

    // 6. Try Company (Only if explicitly requested in types)
    if (types.includes('company')) {
      const companyId = relationshipData?.company?.id || task?.company_id;
      if (companyId) return companyId;
    }

    // REMOVED FALLBACK: No longer returns principal by default
    return undefined;
  }, [relationshipData, currentIndividualId, task]);

  const getEntityNameAndId = useCallback((entityType?: string, entityId?: string) => {
    const targetId = entityId; // Removed || currentIndividualId fallback
    if (!entityType && !targetId) return { name: 'Not specified', id: 'Not specified' };

    const type = entityType?.toLowerCase();

    if (type === 'company') {
      return {
        name: relationshipData?.company?.company_name || task?.company_name || 'Not specified',
        id: String(relationshipData?.company?.id || task?.company_id || 'Not specified')
      };
    }

    // Individuals (Directors, Dependants, Understudies, Sponsors, Principal)
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

    // Final catch - if no ID was found and it's not in our relations, it is truly not specified
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

    // Check entity types in priority order using ENTITY_TYPES
    const priorityOrder = ['company', 'director', 'understudy', 'sponsor', 'dependant', 'principal'];
    for (const type of priorityOrder) {
      if (entityTypes.has(type)) return type;
    }

    return 'principal';
  }, [webData, selectedAutomationId]);

  const resolveEntityIdsForArray = (field: any, relationshipData: any) => {
    const types = field.entityTypes || [];
    const collectedIds = new Set<string>();

    // Iterate strictly through the requested types
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

  const getArrayFieldData = (field: any) => {
    const entityIds = resolveEntityIdsForArray(field, relationshipData);
    const arrayData = [];

    entityIds.forEach((entityId, index) => {
      const columnValues: any = {};
      field.arrayItems?.forEach((item: any) => {
        const qIds = item.linkedJobQuestionIds || (item.linkedJobQuestionId ? [item.linkedJobQuestionId] : []);
        const fieldIds = item.linkedMasterFields || (item.linkedMasterFieldId ? [item.linkedMasterFieldId] : []);

        if (qIds.length > 0) {
          const taskRecord = sourceData['tm_tasks']?.[String(taskId)];
          const answers = taskRecord?.job_specific_answers || {};
          for (const qId of qIds) {
            const a = answers[String(qId)] ?? answers[Number(qId)];
            if (a !== undefined && a !== null && String(a).trim() !== "") {
              columnValues[item.variableName] = cleanFieldValue(a);
              break;
            }
          }
        } else if (fieldIds.length > 0) {
          const values = [];
          for (const fieldId of fieldIds) {
            const fieldIdStr = String(fieldId);
            const masterFieldDef = jobFields[fieldIdStr];

            if (masterFieldDef?.is_computed || masterFieldDef?.computed_config?.is_computed) {
              const itemExtractionMode = item.extractionMode || 'latest';
              const key = `${fieldIdStr}_${entityId}_${itemExtractionMode}`;
              const val = masterFieldComputedValues[key];
              if (val && val !== 'Missing' && val !== 'Computing...') {
                values.push(cleanFieldValue(val));
              }
            } else if (masterFieldDef?.sources?.[0]) {
              const val = getFieldValue(fieldIdStr, String(entityId), 0, item.extractionMode || 'latest');
              if (val && val !== 'Missing' && val !== 'Missing Config' && val !== 'No Source') {
                values.push(cleanFieldValue(val));
              }
            }
          }
          if (values.length > 0) {
            columnValues[item.variableName] = item.type === 'text'
              ? values.join(' ')
              : values.join(', ');
          }
        }
        if (item.type === 'date' && columnValues[item.variableName]) {
          const originalValue = columnValues[item.variableName];
          columnValues[item.variableName] = formatDateValue(
            columnValues[item.variableName],
            item.dateFormat
          );
        }
      });

      if (Object.keys(columnValues).length > 0) {
        const arrayItem = {
          ...columnValues,
          entityId,
          index
        }
        arrayData.push(arrayItem);
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
    const fetchKey = `${selectedAutomationId}-${Object.keys(jobFields).length}-${webData.length}-${Date.now()}`;
    if (isFetchingRef.current) return;
    lastFetchKey.current = fetchKey;
    isFetchingRef.current = true;
    setIsLoadingData(true);
    try {
      const standardFetchQueue = new Map<string, { table: string, ids: Set<string>, linkingVariable: string }>();
      const addToQueue = (table: string, linkingVar: string, id: string) => { const queueKey = `${table}:${linkingVar}`; if (!standardFetchQueue.has(queueKey)) { standardFetchQueue.set(queueKey, { table, ids: new Set(), linkingVariable: linkingVar }); } standardFetchQueue.get(queueKey)!.ids.add(id); };
      const computedRequirements = { individualIds: new Set<string>(), documentIds: new Set<string>() };
      const activeAutomation = webData.find(w => w.automationId === selectedAutomationId);
      const fieldsToProcess = activeAutomation?.fields || [];
      const computedMasterFields: any[] = [];
      fieldsToProcess.forEach((field: any) => {
        if (field.linkedJobQuestionId) { if (taskId) addToQueue('tm_tasks', 'id', String(taskId)); return; }
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

    const jobQuestionIds = fieldDef?.linkedJobQuestionIds || (fieldDef?.linkedJobQuestionId ? [fieldDef.linkedJobQuestionId] : []);

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
        const mappings = finalWebDataItems.map((item, idx) => ({ entityKey: `wd-${idx}`, entityName: item.documentName || item.automationName || `Flow ${idx + 1}`, entityType: 'webdata', automationId: item.automationId, documentId: item.documentId, automation: item.automation }));
        setEntityAutomationMappings(mappings);
        if (mappings.length > 0) { if (!selectedAutomationId || !mappings.some(m => m.automationId === selectedAutomationId)) setSelectedAutomationId(mappings[0].automationId); } else { setSelectedAutomationId(''); }
        const fieldIds = finalWebDataItems.flatMap(i => { const fields = i.fields || []; const directIds = fields.flatMap((f: any) => f.linkedMasterFields || f.masterFieldIds || []); const arrayIds = fields.flatMap((f: any) => (f.arrayItems || []).flatMap((item: any) => item.linkedMasterFields || (item.linkedMasterFieldId ? [item.linkedMasterFieldId] : []))); return [...directIds, ...arrayIds]; }).filter(Boolean);
        const uniqueFieldIds = [...new Set(fieldIds)];
        if (uniqueFieldIds.length > 0) { const { data: fields } = await supabase.from('tm_job_fields').select('*').in('id', uniqueFieldIds); setJobFields(fields?.reduce((acc, f) => ({ ...acc, [f.id.toString()]: f }), {}) || {}); }
      } catch (error) { console.error('Error in fetchData:', error); } finally { setIsLoading(false); }
    };
    fetchData();
  }, [isOpen, task?.job_level]);

  useEffect(() => { if (isOpen && selectedAutomationId && Object.keys(jobFields).length > 0) { fetchSourceData(); fetchDocumentFiles(); } }, [selectedAutomationId, isOpen, fetchSourceData, fetchDocumentFiles]);

  useEffect(() => {
    const fetchIndividualName = async () => {
      if (!currentIndividualId) return;
      if (relationshipData?.principal?.full_name) { setIndividualName(relationshipData.principal.full_name); return; }
      if (relationshipData?.principal?.first_name && relationshipData?.principal?.last_name) { setIndividualName(`${relationshipData.principal.first_name} ${relationshipData.principal.last_name}`); return; }
      try { const { data: individual } = await supabase.from('registry_individuals').select('first_name, last_name, full_name').eq('id', currentIndividualId).single(); if (individual) { const name = individual.full_name || (individual.first_name && individual.last_name ? `${individual.first_name} ${individual.last_name}` : currentIndividualId); setIndividualName(name); } } catch (error) { console.error('Error fetching individual name:', error); setIndividualName(currentIndividualId); }
    };
    fetchIndividualName();
  }, [currentIndividualId, relationshipData]);

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

  const handleRunAutomation = async () => {
    if (!selectedAutomationId) { toast({ title: "Validation Error", description: "Missing automation selection", variant: "destructive" }); return; }
    setIsAutomationRunning(true);
    try {
      const mapping = entityAutomationMappings.find(m => m.automationId === selectedAutomationId);
      if (!mapping?.automation) throw new Error("Automation configuration not found");
      const automation = mapping.automation;
      const automationLogin = automation.login || {};
      const formData: Record<string, any> = {};
      const activeWeb = webData.find(w => w.automationId === selectedAutomationId);
      activeWeb?.fields?.forEach((f: any) => {
        const jobQuestionIds = f.linkedJobQuestionIds || (f.linkedJobQuestionId ? [f.linkedJobQuestionId] : []);

        if (jobQuestionIds.length > 0) {
          const val = getFieldValue(f.variableName, "");
          formData[f.variableName] = (val === 'Missing' || val === 'Missing Task Data') ? null : cleanFieldValue(val);
          return;
        }
        if (f.fieldType === 'document') { const targetId = resolveTargetEntityId(f); const doc = documentFiles.find(d => f.linkedKycDocuments?.includes(d.document_id) && String(d.owner_id) === String(targetId)); if (doc) formData[f.variableName] = buildFileUrl(doc); return; }
        if (f.fieldType === 'computed') return;
        if (f.fieldType === 'array') {
          const entityIds = resolveEntityIdsForArray(f, relationshipData);
          const finalArrayData: any[] = [];
          entityIds.forEach((id: string) => {
            const columnsData = (f.arrayItems || []).map((col: any) => {
              let val: any = '';

              // Handle Multi-link Job Questions within Array Items
              const colQIds = col.linkedJobQuestionIds || (col.linkedJobQuestionId ? [col.linkedJobQuestionId] : []);
              if (colQIds.length > 0) {
                const taskRecord = sourceData['tm_tasks']?.[String(taskId)];
                const answers = taskRecord?.job_specific_answers || {};
                for (const qId of colQIds) {
                  const a = answers[String(qId)] ?? answers[Number(qId)];
                  if (a !== undefined && a !== null && String(a).trim() !== "") {
                    val = a;
                    break;
                  }
                }
                return { ...col, value: cleanFieldValue(val), fieldId: 'job_question' };
              }
              const fieldIds = col.linkedMasterFields || (col.linkedMasterFieldId ? [col.linkedMasterFieldId] : []);
              if (fieldIds.length > 0) {
                const values = [];
                for (const fieldId of fieldIds) {
                  const fieldIdStr = String(fieldId);
                  const field = jobFields[fieldIdStr];
                  if (field?.is_computed || field?.computed_config?.is_computed) {
                    const itemExtractionMode = col.extractionMode || 'latest';
                    const key = `${field.id}_${id}_${itemExtractionMode}`;
                    const val = masterFieldComputedValues[key];
                    if (val && val !== 'Missing' && val !== 'Computing...') {
                      values.push(cleanFieldValue(val));
                    }
                  } else if (field?.sources?.[0]) {
                    const val = getFieldValue(fieldIdStr, String(id), 0, col.extractionMode || 'latest');
                    if (val && val !== 'Missing' && val !== 'Missing Config' && val !== 'No Source') {
                      values.push(cleanFieldValue(val));
                    }
                  }
                }

                // Join multiple values with a space or comma based on field type (matching UI logic)
                if (values.length > 0) {
                  val = col.type === 'text'
                    ? values.join(' ')
                    : values.join(', ');
                }
              }
              return { ...col, value: cleanFieldValue(val), fieldId: fieldIds[0] || 'master_field' };
            });
            const maxRows = Math.max(1, ...columnsData.map((c: any) => Array.isArray(c.value) ? c.value.length : 1));
            for (let i = 0; i < maxRows; i++) {
              const rowObj: Record<string, any> = {};
              columnsData.forEach((col: any) => {
                let v = col.value;
                if (Array.isArray(v)) { v = v[i] !== undefined ? v[i] : ""; }
                else { v = v !== undefined && v !== 'Computing...' ? v : ""; }
                if (col.type === 'date' && v) { v = formatDateValue(v, col.dateFormat); }
                rowObj[col.variableName] = cleanFieldValue(v);
              });
              finalArrayData.push(rowObj);
            }
          });
          formData[f.variableName] = finalArrayData;
          return;
        }
        const targetId = resolveTargetEntityId(f);
        const masterIds = f.linkedMasterFields || f.masterFieldIds || [];
        const values = masterIds.map((mid: string | number) => {
          let val = getFieldValue(String(mid), String(targetId), 0, f.extractionMode || 'latest');
          if (typeof val === 'object' && val !== null) { if (val.day && val.month && val.year) return val; return val.name || val.label || val.value || JSON.stringify(val); }
          if (Array.isArray(val)) { val = val.join(', '); }
          if (f.fieldType === 'date' && val && val !== 'Missing' && val !== 'Computing...') { return formatDateValue(val, f.dateFormat); }
          return (val === 'Missing' || val === 'Computing...' || val === 'Missing Config' || val === 'No Source') ? null : cleanFieldValue(val);
        }).filter(Boolean);
        if (values.length > 0) { formData[f.variableName] = values.length === 1 ? cleanFieldValue(values[0]) : values.join(' '); }
      });
      const computedFields = activeWeb?.fields?.filter((f: any) => f.fieldType === 'computed')?.map((f: any) => ({ variableName: f.variableName, computedFunction: f.computedFunction, computedDocuments: f.computedDocuments || [], entityContext: f.entityTypes?.[0], computed_config: f.computed_config })) || [];
      if (computedFields.length > 0) {
        const cid = relationshipData?.company?.id || task?.company_id;
        for (const config of computedFields) {
          const val = await executeComputedField(config.computedFunction, currentIndividualId, config.computedDocuments, null, 'latest', null, config.computed_config, cid, config.entityContext);
          formData[config.variableName] = val;
        }
      }
      const payload = {
        url: automationLogin.url || "https://fns.immigration.go.ke/account/login.html",
        photoPath: "",
        login: {
          email: automationLogin.email || "",
          idNumber: (typeof automationLogin.idNumber === 'string' && automationLogin.idNumber !== '[object Object]') ? automationLogin.idNumber : "",
          password: automationLogin.password || ""
        },
        formData: formData,
        step2Data: {},
        step3Data: {}
      };
      const res = await fetch(automation.webhook_url, { method: automation.webhook_method || 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!res.ok) throw new Error("Trigger failed: " + res.status);
      toast({ title: 'Success', description: 'Automation process initiated successfully' });
    } catch (e) { console.error("Automation Error:", e); toast({ title: 'Automation Error', description: e.message, variant: 'destructive' }); } finally { setIsAutomationRunning(false); }
  };

  const cancelEditing = () => { setEditingCell(null); setEditValue(''); };
  const startEditing = async (fieldId: string, sourceIdx: number, table: string, path: string, val: string, entityId: string, linkingVariable: string, fieldType?: string, computedFunction?: string, masterFieldId?: string | number) => {
    try {
      if (fieldType === 'computed' || computedFunction) { setEditingCell({ fieldId, sourceIdx, table, path, entityId, linkingVariable, fieldType, computedFunction }); setEditValue(val || ''); return; }
      if (table && entityId) {
        let record = sourceData[table]?.[entityId];
        if (!record) {
          let query = supabase.from(table).select('*');
          if (masterFieldId) { const masterField = jobFields[masterFieldId.toString()]; if (masterField?.sources?.length) { const source = masterField.sources.find(s => s.table === table); if (source?.linking_variable) { query = query.eq(source.linking_variable, entityId); } else { query = query.or(`id.eq.${entityId},director_id.eq.${entityId},company_id.eq.${entityId}`); } } else { query = query.or(`id.eq.${entityId},director_id.eq.${entityId},company_id.eq.${entityId}`); } } else { query = query.or(`id.eq.${entityId},director_id.eq.${entityId},company_id.eq.${entityId}`); }
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
          query = query.or(`id.eq.${entityId},director_id.eq.${entityId},company_id.eq.${entityId}`);
        }

        const { data: fetchedData, error: fetchError } = await query.maybeSingle();

        if (fetchError) throw fetchError;
        if (!fetchedData) throw new Error(`Record not found in table ${table} with identifier ${entityId}`);

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
      if (!existing) throw new Error(`Record not found in database: ${recordPK}`);

      // Use utility to merge JSON paths (handles ->> syntax)
      const updated = updateJsonValue(existing, path, valueToSave);

      // --- 7. EXECUTE UPDATE ---
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
        // Update local state
        setSourceData(prev => ({
          ...prev,
          [table]: { ...(prev[table] || {}), [entityId]: updatedRecord }
        }));

        // Show success toast and refresh documents if callback provided
        toast({ title: 'Success', description: 'Field updated successfully', variant: 'default' });

        // Call refresh callback if provided to update parent table states
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

  const renderFieldsTable = () => {
    if (!activeWebEntry?.fields || activeWebEntry.fields.length === 0) {
      return <div className="p-12 text-center text-slate-400 text-sm">No fields configured for this automation.</div>;
    }

    // Sort fields logic
    const processedFields = activeWebEntry.fields.map((field, index) => {
      let isMissing = false;
      const targetId = resolveTargetEntityId(field);
      const jobQuestionIds = field.linkedJobQuestionIds || (field.linkedJobQuestionId ? [field.linkedJobQuestionId] : []);
      if (field.fieldType === 'array') {
        const entityIds = resolveEntityIdsForArray(field, relationshipData);
        if (entityIds.length === 0) isMissing = true;
      } else if (field.fieldType === 'document') {
        const foundDoc = documentFiles.find(d => field.linkedKycDocuments?.includes(d.document_id) && String(d.owner_id) === String(targetId));
        if (!foundDoc) isMissing = true;
      } else if (field.fieldType === 'computed') {
        const val = computedFieldsPreview[field.variableName];
        if (!val || val === 'Pending...' || val === 'Missing' || val === '') isMissing = true;
      } else if (jobQuestionIds.length > 0) {
        const val = getFieldValue(field.variableName, "");
        if (!val || val === 'Missing' || val === 'Missing Task Data') isMissing = true;
      } else {
        const masterIds = field.linkedMasterFields || field.masterFieldIds || [];
        const mergedValue = masterIds.map((mid: string | number) => {
          const v = getFieldValue(String(mid), String(targetId), 0, field.extractionMode || 'latest');
          return Array.isArray(v) ? v.join(', ') : v;
        }).join(' ').trim();
        if (!mergedValue || mergedValue === 'Missing' || mergedValue === 'Missing Config' || mergedValue === 'Missing') isMissing = true;
      }
      return { ...field, isMissing };
    });

    const sortedFields = sortMissingFirst
      ? [...processedFields].sort((a, b) => (a.isMissing === b.isMissing ? 0 : a.isMissing ? -1 : 1))
      : processedFields;

    return (
      <div className="flex flex-col h-full">
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
                  if (field.fieldType === 'array') {
                    const entityIds = resolveEntityIdsForArray(field, relationshipData);
                    const arrayData = getArrayFieldData(field);
                    const isExpanded = expandedArrayFields.has(field.variableName);

                    return (
                      <React.Fragment key={fIdx}>
                        <TableRow
                          className="bg-blue-50/80 border-b border-blue-200 hover:bg-blue-100 cursor-pointer transition-colors"
                          onClick={() => toggleArrayFieldExpansion(field.variableName)}
                        >
                          <TableCell className="px-2 py-2 text-center text-xs font-bold text-blue-600 border-r border-blue-200 bg-blue-100/50">
                            {isExpanded ? <ChevronDown className="h-4 w-4 mx-auto" /> : <ChevronRight className="h-4 w-4 mx-auto" />}
                          </TableCell>
                          <TableCell colSpan={3} className="px-4 py-2">
                            <div className="flex items-center gap-3">
                              <div className="bg-blue-100 p-1 rounded text-blue-600">
                                <List className="h-4 w-4" />
                              </div>
                              <span className="text-sm font-bold text-slate-800">
                                {field.displayName || field.efnsDisplayName || field.variableName}
                              </span>
                              <Badge className="bg-blue-600 hover:bg-blue-700 text-white h-5 text-[10px] px-2 ml-auto">
                                {arrayData.length} Items found
                              </Badge>
                            </div>
                          </TableCell>
                        </TableRow>

                        {/* 2. FLATTENED ARRAY ITEMS */}
                        {isExpanded && arrayData.map((row, rowIndex) => {
                          return (field.arrayItems || []).map((colItem: any, colIndex: number) => {
                            // --- Resolve Field Definition ---
                            const fieldIds = colItem.linkedMasterFields || (colItem.linkedMasterFieldId ? [colItem.linkedMasterFieldId] : []);
                            const isArrayItemJobQuestion = !!colItem.linkedJobQuestionId; // Check if item is job question
                            let fieldId = '';
                            let masterFieldDef = null;

                            if (!isArrayItemJobQuestion) {
                              const fieldIds = colItem.linkedMasterFields || (colItem.linkedMasterFieldId ? [colItem.linkedMasterFieldId] : []);
                              fieldId = String(fieldIds[0] || '');
                              masterFieldDef = jobFields[fieldId];
                            }

                            // --- Resolve Value ---
                            const columnKey = colItem.variableName || fieldId;
                            const rawValue = row[columnKey];

                            // NEW: Unified Missing Logic for Array Items
                            const isItemValueMissing = !rawValue ||
                              rawValue === 'Missing' ||
                              rawValue === 'Pending...' ||
                              rawValue === 'Document Not Found' ||
                              rawValue === 'Missing Config' ||
                              rawValue === 'No Source' ||
                              rawValue === 'Missing Task Data' ||
                              rawValue === 'Computing...' ||
                              rawValue === '[object Object]';

                            let displayValue = isItemValueMissing ? "Missing" : rawValue;

                            // --- Special handling for document fields ---
                            if (colItem.type === 'document') {
                              const targetId = resolveTargetEntityId(colItem);
                              const foundDoc = documentFiles.find(d =>
                                colItem.linkedKycDocuments?.includes(d.document_id) &&
                                String(d.owner_id) === String(targetId)
                              );
                              displayValue = foundDoc ? "Available" : "Missing";
                            }

                            let arrayPersistenceSource = null;
                            let specificPath = '';

                            // Handle Job Question Persistence
                            if (isArrayItemJobQuestion) {
                              arrayPersistenceSource = {
                                table: 'tm_tasks',
                                path: `job_specific_answers->>'${colItem.linkedJobQuestionId}'`,
                                linking_variable: 'id',
                                entityIdOverride: taskId // Job questions use Task ID
                              };
                            } else if (masterFieldDef) {
                              const baseSource = masterFieldDef.sources?.find((s: any) => s.source_type === entityCategory) || masterFieldDef.sources?.[0];
                              if (baseSource) {
                                if (baseSource.path && baseSource.path.includes('[]')) {
                                  specificPath = baseSource.path.replace('[]', `.${rowIndex}`);
                                } else {
                                  specificPath = baseSource.path;
                                }
                                arrayPersistenceSource = {
                                  ...baseSource,
                                  path: specificPath,
                                  entityIdOverride: row.entityId
                                };
                              }
                            }

                            const isItemEditable = !!arrayPersistenceSource;
                            const uniqueKey = `${field.variableName}-${rowIndex}-${colIndex}`;
                            const isItemEditing = editingCell?.fieldId === uniqueKey;

                            // --- Resolve Dropdown Options (Including Dependencies) ---
                            let isItemDropdown = false;
                            let itemDropdownOptions: any[] = [];

                            if (masterFieldDef?.type === 'select') {
                              isItemDropdown = true;
                              const opts = masterFieldDef.options;

                              if (opts?.isDependencyConfig) {
                                // 1. Identify Parent Field
                                const parentId = opts.dependencyConfig?.dependentFieldId;

                                // 2. Find Parent Value (Look in current ROW first, then Global)
                                let parentValue = null;
                                if (parentId) {
                                  parentValue = row[parentId] ||
                                    Object.entries(row).find(([k]) => k === String(parentId))?.[1];

                                  if (!parentValue) {
                                    // Fallback to global
                                    const globalVal = getFieldValue(String(parentId), String(targetId));
                                    if (globalVal && globalVal !== 'Missing' && globalVal !== 'Computing...') {
                                      parentValue = globalVal;
                                    }
                                  }

                                  // 3. *** REVERSE LOOKUP FIX ***
                                  const parentFieldDef = jobFields[parentId];
                                  if (parentFieldDef && Array.isArray(parentFieldDef.options) && parentValue) {
                                    const matchingParentOption = parentFieldDef.options.find((opt: any) => {
                                      const optLabel = typeof opt === 'string' ? opt : opt.label;
                                      return String(optLabel) === String(parentValue);
                                    });
                                    if (matchingParentOption && typeof matchingParentOption !== 'string') {
                                      parentValue = matchingParentOption.value;
                                    }
                                  }
                                }

                                // 4. Get Options based on Resolved Parent Value
                                if (parentValue && parentValue !== 'Missing') {
                                  itemDropdownOptions = opts.manualMapping?.[parentValue] || [];
                                } else {
                                  itemDropdownOptions = [];
                                }

                              } else if (Array.isArray(opts)) {
                                // Standard Options
                                itemDropdownOptions = opts.map(o => typeof o === 'string' ? { label: o, value: o } : o);
                              }
                            }

                            // --- Helper for Display ---
                            const getArrayItemDisplayValue = (val: string) => {
                              if (!isItemDropdown) return cleanFieldValueForDisplay(val);
                              const option = itemDropdownOptions.find(o => String(o.value) === String(val) || o.label === val);
                              return option ? option.label : cleanFieldValueForDisplay(val);
                            };

                            return (
                              <TableRow key={uniqueKey} className={cn("group border-b border-slate-100 transition-colors", isItemEditing ? "bg-blue-50" : "hover:bg-slate-50")}>
                                {/* Indentation + Index */}
                                <TableCell className="px-2 py-2 text-center text-xs font-mono text-slate-400 border-r border-slate-100 bg-slate-50/50">
                                  <div className="flex justify-center items-center gap-1">
                                    <span className="opacity-40">{fIdx + 1}.</span>
                                    <span className="font-semibold text-blue-600">{rowIndex + 1}</span>
                                  </div>
                                </TableCell>

                                {/* Field Label with Thread Line */}
                                <TableCell className="px-4 py-2 border-r border-slate-100 relative">
                                  <div className="flex items-center gap-2 pl-6 relative">
                                    <div className="absolute left-3 top-0 bottom-0 w-px bg-blue-100"></div>
                                    <div className="absolute left-3 top-1/2 w-3 h-px bg-blue-200"></div>

                                    <span className="text-sm text-slate-700 font-medium">
                                      {colItem.displayName || colItem.name || colItem.header || masterFieldDef?.label || "Unknown Column"}
                                    </span>
                                    {colItem.type === 'document' && <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-700 bg-amber-50">Document</Badge>}
                                  </div>
                                </TableCell>

                                {/* Source Info */}
                                <TableCell className="px-4 py-2 text-xs text-slate-600">
                                  {isArrayItemJobQuestion ? (
                                    <div className="font-mono text-[10px] bg-purple-100 text-purple-700 p-1 rounded inline-flex items-center"><HelpCircle className="h-3 w-3 mr-1" /> Job Question</div>
                                  ) : arrayPersistenceSource ? (
                                    <TooltipProvider delayDuration={300}>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <div className="font-mono text-[10px] bg-slate-50 text-slate-500 p-1 rounded inline-flex items-center truncate max-w-[200px] cursor-help">
                                            <Database className="h-3 w-3 mr-1 text-slate-400" />
                                            {arrayPersistenceSource.table?.replace('acc_portal_', '').substring(0, 10)}...
                                          </div>
                                        </TooltipTrigger>
                                        <TooltipContent className="text-xs">
                                          <p>Table: {arrayPersistenceSource.table}</p>
                                          <p>Path: {arrayPersistenceSource.path}</p>
                                          <p>ID: {arrayPersistenceSource.entityIdOverride}</p>
                                        </TooltipContent>
                                      </Tooltip>
                                    </TooltipProvider>
                                  ) : (
                                    <span className="text-slate-300 italic text-[10px]">Computed / No Map</span>
                                  )}
                                </TableCell>

                                {/* Value / Edit Input */}
                                <TableCell className="px-4 py-1 border-r border-slate-100 h-full">
                                  {colItem.type === 'document' ? (
                                    <div className="flex items-center gap-2">
                                      {displayValue === "Available" ? (
                                        <>
                                          <Badge className="bg-green-600 text-white h-6">Available</Badge>
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => {
                                              const targetId = resolveTargetEntityId(colItem);
                                              const doc = documentFiles.find(d =>
                                                colItem.linkedKycDocuments?.includes(d.document_id) &&
                                                String(d.owner_id) === String(targetId)
                                              );
                                              if (doc) handlePreviewDocument(doc);
                                            }}
                                            className="h-6 px-2 text-xs"
                                          >
                                            <Eye className="h-3 w-3 mr-1" />
                                            Preview
                                          </Button>
                                        </>
                                      ) : (
                                        <Badge variant="destructive" className="h-6">Missing</Badge>
                                      )}
                                    </div>
                                  ) : isItemEditing ? (
                                    <div className="flex items-center gap-2">
                                      {isItemDropdown ? (
                                        <Select value={editValue} onValueChange={setEditValue}>
                                          <SelectTrigger className="h-8 text-sm border-blue-400 w-full min-w-[150px]"><SelectValue /></SelectTrigger>
                                          <SelectContent>
                                            {itemDropdownOptions.length > 0 ? (
                                              itemDropdownOptions.map((opt, i) => (
                                                <SelectItem key={`${opt.value}-${i}`} value={String(opt.value)}>{opt.label}</SelectItem>
                                              ))
                                            ) : (
                                              <div className="p-2 text-xs text-slate-400">No options (Check parent field)</div>
                                            )}
                                          </SelectContent>
                                        </Select>
                                      ) : (
                                        <Input
                                          autoFocus
                                          value={editValue}
                                          onChange={e => setEditValue(e.target.value)}
                                          onKeyDown={e => { if (e.key === 'Enter') saveEdit(isItemDropdown, itemDropdownOptions); if (e.key === 'Escape') cancelEditing(); }}
                                          className="h-8 text-sm border-blue-400"
                                        />
                                      )}
                                      <Button size="icon" onClick={() => saveEdit(isItemDropdown, itemDropdownOptions)} className="h-8 w-8 bg-green-600 hover:bg-green-700 shrink-0"><Check className="h-4 w-4" /></Button>
                                      <Button size="icon" variant="ghost" onClick={cancelEditing} className="h-8 w-8 text-red-500 shrink-0"><X className="h-4 w-4" /></Button>
                                    </div>
                                  ) : (
                                    <div
                                      className={cn(
                                        "text-sm h-7 flex items-center px-2 rounded -my-1 transition-colors relative",
                                        isItemEditable ? "cursor-pointer border border-transparent hover:border-blue-400 hover:bg-blue-50" : "cursor-default",
                                        isItemValueMissing ? "text-red-600 font-medium italic" : "text-slate-900" // UPDATED: Styles now match main table
                                      )}
                                      onClick={() => {
                                        if (!isItemEditable || !arrayPersistenceSource) return;
                                        startEditing(
                                          uniqueKey,
                                          0,
                                          arrayPersistenceSource.table,
                                          arrayPersistenceSource.path,
                                          String(displayValue === 'Missing' ? '' : displayValue),
                                          String(arrayPersistenceSource.entityIdOverride),
                                          arrayPersistenceSource.linking_variable || 'id',
                                          undefined,
                                          undefined,
                                          isArrayItemJobQuestion ? undefined : fieldId
                                        );
                                      }}
                                    >
                                      {getArrayItemDisplayValue(displayValue)}
                                      {isItemEditable && !isItemEditing && <Edit3 className="h-3 w-3 ml-auto text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity absolute right-2" />}
                                    </div>
                                  )}
                                </TableCell>
                              </TableRow>
                            );
                          });
                        })}

                        {isExpanded && (
                          <TableRow className="bg-slate-50 border-b-2 border-slate-200">
                            <TableCell colSpan={4} className="py-1">
                              <div className="h-1 w-full bg-gradient-to-r from-blue-100 to-transparent"></div>
                            </TableCell>
                          </TableRow>
                        )}
                      </React.Fragment>
                    );
                  }

                  // =========================================================
                  // CASE: DOCUMENT FIELDS
                  // =========================================================
                  if (field.fieldType === 'document') {
                    const targetId = resolveTargetEntityId(field);
                    const foundDoc = documentFiles.find(d => field.linkedKycDocuments?.includes(d.document_id) && String(d.owner_id) === String(targetId));

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
                        <TableCell className="px-4 py-2">
                          <span className="text-xs text-slate-500">KYC: {field.kycDocumentId?.substring(0, 12)}...</span>
                        </TableCell>
                        <TableCell className="px-4 py-2 border-r border-slate-100">
                          {foundDoc ? (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handlePreviewDocument(foundDoc)}
                                className="h-6 px-2 text-xs mr-2"
                              >
                                <Eye className="h-3 w-3 mr-1" />
                                Preview
                              </Button>
                              <Badge className="bg-green-600 text-white h-6">Available</Badge>
                            </>
                          ) : (
                            <Badge variant="destructive" className="h-6">Missing</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  }

                  let persistenceSource = null;
                  let mergedValue = "";
                  let isDropdown = false;
                  let dropdownOptions = [];
                  let masterFieldDef = null;

                  if (field.fieldType === 'computed') {
                    mergedValue = computedFieldsPreview[field.variableName] || "";
                    isDropdown = false;

                    // --- FALLBACK LOGIC START ---
                    // Resolve Master Field to check for Fallback
                    let mappingKey = null;
                    if (field.computedFunction === 'extractCurrentJobTitle') mappingKey = 'job_title';
                    else if (field.computedFunction === 'extractCurrentJobDescription') mappingKey = 'job_description';
                    else mappingKey = field.variableName; // Try matching variable name to field_key

                    // Look up master field definition
                    masterFieldDef = Object.values(jobFields).find(jf => jf.field_key === mappingKey);

                    // If computed value is missing/error, try fallback to Master Field sources
                    const isComputedError = !mergedValue || mergedValue === 'Document Not Found' || mergedValue === 'Field Not Found' || mergedValue === 'Missing Document' || mergedValue === 'No Document Specified';

                    if (isComputedError && masterFieldDef) {
                      // This uses getFieldValue which iterates through ALL sources of the master field
                      const fallbackVal = getFieldValue(String(masterFieldDef.id), String(targetId));
                      // If fallback is valid (and not just the same error), use it
                      if (fallbackVal && fallbackVal !== 'Missing' && fallbackVal !== 'No Source' && fallbackVal !== 'Computing...' && fallbackVal !== 'Document Not Found') {
                        mergedValue = fallbackVal;
                      }
                    }

                    // Set persistence source for editing if available
                    if (masterFieldDef) {
                      persistenceSource = masterFieldDef.sources?.find(s => s.source_type === entityCategory) || masterFieldDef.sources?.[0];
                    }
                    // --- FALLBACK LOGIC END ---

                  } else if (isJobQuestion) {
                    mergedValue = getFieldValue(field.variableName, String(targetId));
                    persistenceSource = { table: 'tm_tasks', path: `job_specific_answers->>'${field.linkedJobQuestionId}'`, linking_variable: 'id' };
                    const qDef = requirementJobQuestions.find(q => String(q.id) === String(field.linkedJobQuestionId));
                    if (qDef?.type === 'select') {
                      isDropdown = true;
                      dropdownOptions = (qDef.options || []).map(opt => ({ label: opt, value: opt }));
                    }
                  } else {
                    const masterIds = field.linkedMasterFields || field.masterFieldIds || [];
                    masterFieldDef = jobFields[masterIds[0]];
                    mergedValue = masterIds.map(mid => getFieldValue(String(mid), String(targetId), 0, field.extractionMode)).join(' ').trim();
                    persistenceSource = masterFieldDef?.sources?.find(s => s.source_type === entityCategory) || masterFieldDef?.sources?.[0];

                    if (masterFieldDef?.type === 'select') {
                      isDropdown = true;
                      const opts = masterFieldDef.options;
                      if (opts?.isDependencyConfig) {
                        dropdownOptions = getDependentDropdownOptions(field, masterFieldDef, String(targetId));
                      } else if (Array.isArray(opts)) {
                        dropdownOptions = opts.map(o => typeof o === 'string' ? { label: o, value: o } : o);
                      }
                    }
                  }

                  const getDisplayValue = (val: string) => {
                    if (!isDropdown) return cleanFieldValueForDisplay(val);
                    const option = dropdownOptions.find(o => String(o.value) === String(val) || o.label === val);
                    return option ? option.label : cleanFieldValueForDisplay(val);
                  };

                  const isEditable = !!persistenceSource;
                  const isValueMissing = !mergedValue ||
                    mergedValue === 'Missing' ||
                    mergedValue === 'Pending...' ||
                    mergedValue === 'Document Not Found' ||
                    mergedValue === 'Missing Config' ||
                    mergedValue === 'No Source' || // Added No Source
                    mergedValue === 'Missing Task Data' ||
                    mergedValue === 'Computing...' ||
                    mergedValue === '[object Object]'; // Added object check

                  const getFinalDisplayValue = (val: string) => {
                    if (isValueMissing && val !== 'Computing...') return 'Missing';
                    return getDisplayValue(val);
                  };

                  return (
                    <TableRow key={fIdx} className={cn("group border-b border-slate-200 transition-colors", isEditing ? "bg-blue-50/50" : (field.fieldType === 'computed' ? "bg-purple-50/10" : "hover:bg-blue-50"))}>
                      <TableCell className="px-2 py-2 text-center text-xs font-mono text-slate-400 border-r border-slate-100 bg-slate-50">{fIdx + 1}</TableCell>
                      <TableCell className="px-4 py-2 border-r border-slate-100">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-slate-900">{field.displayName || field.efnsDisplayName || field.variableName}</span>
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
                              // (Dynamic array logic removed here as handled in array section)
                              startEditing(
                                field.variableName,
                                0,
                                persistenceSource.table,
                                finalPath,
                                mergedValue,
                                String(idToUse),
                                persistenceSource.linking_variable || 'id',
                                field.fieldType,
                                field.computedFunction
                              );
                            }}
                          >
                            {isComputing ? <Loader2 className="h-3 w-3 animate-spin mr-2" /> : getFinalDisplayValue(mergedValue)}
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
    // Collect all document fields: normal fields + array item fields
    const normalDocFields = activeWebEntry?.fields?.filter((f: any) => f.fieldType === 'document') || [];

    // Collect document fields from array items
    const arrayDocFields = activeWebEntry?.fields?.filter((f: any) => f.fieldType === 'array')
      ?.flatMap((field: any) => {
        return (field.arrayItems || [])
          .filter((colItem: any) => colItem.type === 'document')
          .map((colItem: any) => ({
            ...colItem,
            // Add array context for display
            arrayFieldName: field.displayName || field.efnsDisplayName || field.variableName,
            arrayVariableName: field.variableName,
            isFromArray: true
          }));
      }) || [];

    // Combine all document fields
    const allDocFields = [...normalDocFields, ...arrayDocFields];

    if (allDocFields.length === 0) return <div className="p-12 text-center text-slate-400">No document assets configured.</div>;

    return (
      <div className="grid grid-cols-2 gap-4">
        {allDocFields.map((req, idx) => {
          const targetId = resolveTargetEntityId(req);
          const foundDoc = documentFiles.find(d => req.linkedKycDocuments?.includes(d.document_id) && String(d.owner_id) === String(targetId));
          const displayName = req.isFromArray
            ? `${req.arrayFieldName} - ${req.displayName || req.name || req.variableName}`
            : req.displayName || req.efnsDisplayName || req.variableName;

          return (
            <Card key={idx} className={cn("overflow-hidden border transition-all", foundDoc ? "border-green-200 shadow-sm" : "border-red-200 bg-red-50/10")}>
              <CardContent className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={cn("p-2 rounded-lg", foundDoc ? "bg-green-100 text-green-600" : "bg-red-100 text-red-600")}><Paperclip className="h-4 w-4" /></div>
                  <div className="flex-1">
                    <h4 className="font-bold text-sm text-slate-900">{displayName}</h4>
                    <p className="text-[10px] text-slate-500">
                      Target: {req.isFromArray ? `${req.arrayVariableName}.${req.variableName}` : req.variableName}
                    </p>
                    {req.isFromArray && (
                      <p className="text-[9px] text-blue-600 font-medium">Array Item</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {foundDoc && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handlePreviewDocument(foundDoc)}
                        className="h-8 px-2 text-xs"
                      >
                        <Eye className="h-3 w-3 mr-1" />
                        Preview
                      </Button>
                      <Badge className="bg-green-600">Available</Badge>
                    </>
                  )}
                  {!foundDoc && <Badge variant="destructive">Missing</Badge>}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    );
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="max-w-[95vw] w-[1400px] h-[90vh] flex flex-col p-0 overflow-hidden border-none shadow-2xl bg-white">
          <div className="p-5 border-b bg-gradient-to-r from-blue-600 to-blue-500 flex items-center justify-between shadow-lg">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 bg-white/20 rounded-xl flex items-center justify-center text-white backdrop-blur">
                <Zap className="h-6 w-6 fill-white" />
              </div>
              <div>
                <DialogTitle className="text-2xl font-black text-white tracking-tight">
                  Data Mapping: {task?.applicant_details?.name || task?.applicant_name || individualName || "Applicant"}
                </DialogTitle>
                <div className="flex items-center gap-2 text-white/80 text-sm mt-0.5">
                  <span className="bg-white/10 px-1.5 py-0.5 rounded font-mono">Task #{task?.id}</span>
                  <span>•</span>
                  <span>ID: {(() => {
                    // Keep ID logic as fallback to specific entity found via automation context
                    const primaryEntityType = getPrimaryEntityType();
                    const entityInfo = getEntityNameAndId(primaryEntityType);
                    return entityInfo.id !== 'Not specified' ? entityInfo.id : (task?.applicant_details?.id || 'N/A');
                  })()}</span>
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
                  value={(() => {
                    const primaryEntityType = getPrimaryEntityType();
                    const entityInfo = getEntityNameAndId(primaryEntityType);
                    return entityInfo.id;
                  })()}
                  onChange={(e) => {
                    const primaryEntityType = getPrimaryEntityType();
                    const entityInfo = getEntityNameAndId(primaryEntityType);
                    if (primaryEntityType === 'principal') {
                      setCurrentIndividualId(e.target.value);
                    }
                  }}
                  placeholder="ID Number..."
                  className="w-28 outline-none text-sm font-semibold text-white bg-transparent placeholder:text-white/50"
                  disabled={(() => {
                    const primaryEntityType = getPrimaryEntityType();
                    return primaryEntityType !== 'principal';
                  })()}
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
                      {isLoading ? (
                        <div className="flex flex-col items-center justify-center h-full text-slate-400">
                          <Loader2 className="h-8 w-8 animate-spin mb-2" />
                          <p>Loading configuration...</p>
                        </div>
                      ) : renderFieldsTable()}
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

      {/* Document Preview Modal */}
      <Dialog open={showPreviewModal} onOpenChange={setShowPreviewModal}>
        <DialogContent className="max-w-[95vw] w-full max-h-[95vh] flex flex-col p-0 overflow-hidden bg-slate-50">
          {showPreviewModal && previewingDocuments && (
            <>
              <DialogHeader className="p-4 border-b bg-white shrink-0">
                <div className="flex items-center justify-between">
                  <div>
                    <DialogTitle className="text-xl">
                      <div className="flex items-center p-2">
                        <div className="bg-white p-2 rounded-lg border shadow-sm">
                          <FileText className="h-5 w-5 text-blue-600" />
                        </div>
                        <div className="flex flex-col">
                          <p className="text-xl font-bold text-slate-800 line-clamp-1">{previewingDocuments?.document_display_name || 'Document'}</p>
                        </div>
                      </div>
                    </DialogTitle>
                    <p className="text-sm text-muted-foreground">
                      Target: {previewingDocuments?.person_full_name || 'Unknown'}
                    </p>
                  </div>

                  <div className="text-sm font-medium bg-blue-50 text-blue-700 px-3 py-1 rounded-full border border-blue-100">
                    {previewingDocuments?.documents?.length || 0} File(s)
                  </div>
                </div>
                <DialogDescription className="sr-only">
                  Document extraction and verification interface.
                </DialogDescription>
              </DialogHeader>

              <div className="flex-1 overflow-auto p-4">
                {previewingDocuments?.documents?.map((doc, index) => {
                  const docId = doc.id || `doc-${index}`;

                  return (
                    <div key={docId} className="p-0 lg:p-4">
                      <ExtractionPreview
                        key={docId}
                        documentName={previewingDocuments?.document_display_name || 'Document'}
                        extractedData={doc.edited_details || doc.extracted_details || {}}
                        fields={doc.document_fields || []}
                        fileUrl={getFileUrl(doc.file_path)}
                        fileName={doc.file_name || 'document.pdf'}
                        expanded={true}
                        showSaveButton={true}
                        onSave={(data) => handleSaveEditedDocument(doc, data)}
                        onDataChange={(fieldName, value) => {
                          handlePreviewDataChange(docId, fieldName, value);
                        }}
                        documentTypes={[]}
                        type={doc.director_id ? 'individual' : 'company'}
                        file={doc}
                        extractionStatus={doc.extraction_status || 'success'}
                        supabase={supabase}
                        onDialogClose={() => {
                          setShowPreviewModal(false);
                        }}
                      />
                    </div>
                  );
                })}
              </div>

              <div className="p-4 border-t bg-white flex justify-end shrink-0">
                <Button variant="outline" onClick={() => setShowPreviewModal(false)} className="w-24">
                  Close
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};