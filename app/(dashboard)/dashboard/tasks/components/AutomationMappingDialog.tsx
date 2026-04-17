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
import { toast } from '@/lib/hooks/use-toast';
import supabase from '@/lib/supabase/client';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { processComputedFields, executeComputedField } from '../utils/automationComputedFunctions';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ExtractionPreview } from "@/components/ExtractionPreview"
import { ENTITY_TYPES, type EntityType } from "@/lib/constants/entity-types";
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

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

const isValidValue = (val: any): boolean => {
  if (val === null || val === undefined || val === '') return false;
  const errorStrings = [
    'Missing', 'Missing Config', 'No Source', 'Computing...',
    'Document Not Found', 'Field Not Found', 'Missing Document',
    'No Document Specified', 'Missing Task Data', '[object Object]'
  ];
  return !errorStrings.includes(String(val));
};

// ─── CONSTANT: Fixed document_id for eTA Kenya screenshots ───────────────────
const ETA_SCREENSHOT_DOCUMENT_ID = '630d0ece-4c94-417b-ae64-135187419699';

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
  refreshDocuments,
  enhancedTasksData = new Map()
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
  // ── NEW: track the saved eTA screenshot document record ──────────────────────
  const [savedScreenshotDoc, setSavedScreenshotDoc] = useState<any>(null);
  const [isSavingScreenshot, setIsSavingScreenshot] = useState(false);

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

  const getCurrentIndividualEntityType = useCallback((): string => {
    if (!currentIndividualId) return 'principal';

    // Check if current individual is a dependant
    if (relationshipData?.dependants?.some((d: any) => String(d.id) === String(currentIndividualId))) {
      return 'dependant';
    }

    // Check if current individual is a director
    if (relationshipData?.directors?.some((d: any) => String(d.id) === String(currentIndividualId))) {
      return 'director';
    }

    // Check if current individual is a sponsor
    if (String(relationshipData?.sponsor?.id) === String(currentIndividualId)) {
      return 'sponsor';
    }

    // Check if current individual is an understudy
    if (String(relationshipData?.understudy?.id) === String(currentIndividualId)) {
      return 'understudy';
    }

    // Check if current individual is the principal
    if (String(relationshipData?.principal?.id) === String(currentIndividualId)) {
      return 'principal';
    }

    // Default to principal if not found
    return 'principal';
  }, [currentIndividualId, relationshipData]);

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

  // ── NEW: derive the target entity id used in the header ID badge ─────────────
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

  const resolveVariableValue = useCallback((fieldDef: any, targetEntityId: string) => {
    const logic = fieldDef.sourceLogic || 'priority';
    const masterIds = fieldDef.linkedMasterFields || [];
    const questionIds = fieldDef.linkedJobQuestionIds || [];
    const extractionMode = fieldDef.extractionMode || 'latest';

    const collectedValues: string[] = [];

    // 1. Process Master Fields in priority order
    for (const mid of masterIds) {
      const val = getFieldValue(String(mid), String(targetEntityId), 0, extractionMode);
      if (isValidValue(val)) {
        if (logic === 'priority') return val; // Found first priority, exit
        collectedValues.push(val);
      }
    }

    // 2. Process Job Questions in priority order
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

    // 3. Handle "All" logic vs "Missing"
    if (logic === 'all' && collectedValues.length > 0) {
      return collectedValues.join(', ');
    }

    // 4. Default Fallback
    if (fieldDef.default_value && fieldDef.default_value !== 'Missing') return fieldDef.default_value;

    return "Missing";
  }, [sourceData, jobFields, masterFieldComputedValues, taskId]);

  // --- UPDATED ARRAY DATA RESOLVER ---
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

      // Use bulk-fetched data instead of individual query
      const taskData = enhancedTasksData.get(task?.id?.toString());
      const individualData = taskData?.applicant_data;
      if (individualData) {
        const name = individualData.full_name || (individualData.first_name && individualData.last_name ? `${individualData.first_name} ${individualData.last_name}` : currentIndividualId);
        setIndividualName(name);
        return;
      }

      // Fallback to individual query only if bulk data not available
      try {
        const { data: individual } = await supabase.from('registry_individuals').select('first_name, last_name, full_name').eq('id', currentIndividualId).single();
        if (individual) {
          const name = individual.full_name || (individual.first_name && individual.last_name ? `${individual.first_name} ${individual.last_name}` : currentIndividualId);
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

  // Helper function to clean missing values from form data
  const cleanFormData = (data: Record<string, any>): Record<string, any> => {
    const cleaned: Record<string, any> = {};

    for (const [key, value] of Object.entries(data)) {
      if (value === null || value === undefined || value === '' || value === 'Missing') {
        // Skip missing values entirely
        continue;
      }

      if (Array.isArray(value)) {
        // Process arrays
        const cleanedArray = value
          .map(item => {
            if (typeof item === 'object' && item !== null) {
              // Clean object properties, excluding system fields
              const cleanedItem: Record<string, any> = {};
              let hasMeaningfulData = false;

              for (const [itemKey, itemValue] of Object.entries(item)) {
                // Skip system fields that don't represent meaningful data
                if (['entityId', 'index', 'id'].includes(itemKey)) {
                  cleanedItem[itemKey] = itemValue;
                  continue;
                }

                if (itemValue !== null && itemValue !== undefined && itemValue !== '' && itemValue !== 'Missing') {
                  cleanedItem[itemKey] = itemValue;
                  hasMeaningfulData = true;
                }
              }

              // Only keep the item if it has meaningful data beyond system fields
              return hasMeaningfulData ? cleanedItem : null;
            }
            return item;
          })
          .filter(item => item !== null);

        // Only include the array if it's not empty after cleaning
        if (cleanedArray.length > 0) {
          cleaned[key] = cleanedArray;
        }
      } else if (typeof value === 'object' && value !== null) {
        // Process objects
        const cleanedObj: Record<string, any> = {};
        let hasMeaningfulData = false;

        for (const [objKey, objValue] of Object.entries(value)) {
          // Skip system fields that don't represent meaningful data
          if (['entityId', 'index', 'id'].includes(objKey)) {
            cleanedObj[objKey] = objValue;
            continue;
          }

          if (objValue !== null && objValue !== undefined && objValue !== '' && objValue !== 'Missing') {
            cleanedObj[objKey] = objValue;
            hasMeaningfulData = true;
          }
        }

        // Only include object if it has meaningful data beyond system fields
        if (hasMeaningfulData) {
          cleaned[key] = cleanedObj;
        }
      } else {
        // Include primitive values that are not missing
        cleaned[key] = value;
      }
    }

    return cleaned;
  };

  // ── NEW: save base64 screenshot to Supabase storage + directors_documents ────
  const saveScreenshotToSupabase = async (base64Screenshot: string, directorId: string): Promise<any> => {
    setIsSavingScreenshot(true);
    try {
      // 1. Convert base64 → Blob
      const byteCharacters = atob(base64Screenshot);
      const byteNumbers = new Array(byteCharacters.length).fill(0).map((_, i) => byteCharacters.charCodeAt(i));
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: 'image/png' });

      // 2. Build storage path
      const timestamp = Date.now();
      const fileName = `eta-kenya-confirmation-${timestamp}.png`;
      const storagePath = `individual-documents/${directorId}/${ETA_SCREENSHOT_DOCUMENT_ID}/${fileName}`;

      // 3. Upload to kyc-documents bucket
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('kyc-documents')
        .upload(storagePath, blob, {
          contentType: 'image/png',
          upsert: false,
        });

      if (uploadError) throw new Error(`Storage upload failed: ${uploadError.message}`);

      // 4. Insert record into acc_portal_directors_documents
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

      if (insertError) throw new Error(`DB insert failed: ${insertError.message}`);

      console.log('✅ Screenshot saved to Supabase:', docRecord);
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
          // Use the priority/all resolution logic
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
      // Clean the form data to remove missing values
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

      if (response.success) {
        // ── SAVE SCREENSHOT TO SUPABASE ─────────────────────────────────────
        if (response.screenshot) {
          const directorId = getPrimaryTargetEntityId();

          if (directorId && directorId !== 'N/A') {
            try {
              const savedDoc = await saveScreenshotToSupabase(response.screenshot, directorId);
              setSavedScreenshotDoc(savedDoc);

              // ── AUTO-OPEN PREVIEW with the saved document ──────────────────
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
                title: '✅ Automation Completed!',
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
            // No valid director ID — fall back to download
            const screenshotDataUrl = `data:image/png;base64,${response.screenshot}`;
            const link = document.createElement('a');
            link.href = screenshotDataUrl;
            link.download = `eta-confirmation-${Date.now()}.png`;
            link.click();

            toast({
              title: '✅ Automation Completed!',
              description: response.message || 'Screenshot downloaded (no entity ID to save against).',
            });
          }
        } else {
          // No screenshot
          toast({
            title: '✅ Automation Completed!',
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

    // Get the current individual's entity type
    const currentEntityType = getCurrentIndividualEntityType();

    // --- 1. PRE-PROCESS FIELDS (Calculate values and status) ---
    // Filter fields to only show those applicable to the current individual's entity type
    // This prevents duplicates when a field applies to multiple entity types
    const filteredFields = activeWebEntry.fields.filter((field) => {
      const fieldEntityTypes = field.entityTypes || [];
      // If field has no entity types, show it (backward compatibility)
      if (fieldEntityTypes.length === 0) return true;
      // Show field if it applies to the current individual's entity type
      return fieldEntityTypes.includes(currentEntityType);
    });

    const processedFields = filteredFields.map((field) => {
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
        // Use the unified resolver that respects priority/all logic
        value = resolveVariableValue(field, String(targetId));
      }

      return {
        ...field,
        resolvedValue: value,
        isMissing: !isValidValue(value),
        targetId: String(targetId)
      };
    });

    // Sort logic
    const sortedFields = sortMissingFirst
      ? [...processedFields].sort((a, b) => (a.isMissing === b.isMissing ? 0 : a.isMissing ? -1 : 1))
      : processedFields;

    return (
      <div className="flex flex-col h-full">
        {/* --- TABLE HEADER / ACTIONS --- */}
        <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-slate-200">
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-slate-600">{processedFields.length} Fields Total</span>
            {processedFields.filter(f => f.isMissing).length > 0 && (
              <Badge variant="destructive" className="h-6 px-2 text-xs">
                {processedFields.filter(f => f.isMissing).length} Missing
              </Badge>
            )}
          </div>
          <Button
            variant={sortMissingFirst ? "default" : "outline"}
            size="sm"
            onClick={() => setSortMissingFirst(!sortMissingFirst)}
            className="h-8 text-xs"
          >
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
                  <TableHead className="w-80 px-4 py-3 text-left text-xs font-bold text-slate-700 border-r border-slate-200">TARGET VARIABLE</TableHead>
                  <TableHead className="px-4 py-3 text-left text-xs font-bold text-slate-700">SOURCE LOGIC</TableHead>
                  <TableHead className="px-4 py-3 text-left text-xs font-bold text-slate-700 border-r border-slate-200">CURRENT VALUE</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {sortedFields.map((field, fIdx) => {
                  const isEditing = editingCell?.fieldId === field.variableName;
                  const entityCategory = field.entityTypes?.includes('company') ? 'company' : 'individual';

                  // =========================================================
                  // CASE: ARRAY FIELDS (Nested Logic)
                  // =========================================================
                  if (field.fieldType === 'array') {
                    const arrayData = getArrayFieldData(field);
                    const isExpanded = expandedArrayFields.has(field.variableName);

                    return (
                      <React.Fragment key={`field-${fIdx}`}>
                        <TableRow
                          className="bg-blue-50/80 border-b border-blue-200 hover:bg-blue-100 cursor-pointer transition-colors"
                          onClick={() => toggleArrayFieldExpansion(field.variableName)}
                        >
                          <TableCell className="px-2 py-2 text-center text-xs font-bold text-blue-600 border-r border-blue-200 bg-blue-100/50">
                            {isExpanded ? <ChevronDown className="h-4 w-4 mx-auto" /> : <ChevronRight className="h-4 w-4 mx-auto" />}
                          </TableCell>
                          <TableCell colSpan={3} className="px-4 py-2">
                            <div className="flex items-center gap-3">
                              <div className="bg-blue-100 p-1 rounded text-blue-600"><List className="h-4 w-4" /></div>
                              <span className="text-sm font-bold text-slate-800">{field.efnsDisplayName || field.variableName}</span>
                              <Badge className="bg-blue-600 text-white h-5 text-[10px] px-2 ml-auto">{arrayData.length} Items</Badge>
                            </div>
                          </TableCell>
                        </TableRow>

                        {isExpanded && arrayData.map((row, rowIndex) => (
                          (field.arrayItems || []).map((colItem, colIndex) => {
                            const uniqueKey = `${field.variableName}-${rowIndex}-${colIndex}`;
                            const isItemEditing = editingCell?.fieldId === uniqueKey;
                            const rawValue = row[colItem.variableName];
                            const isItemMissing = !isValidValue(rawValue);

                            const masterFieldId = colItem.linkedMasterFields?.[0];
                            const masterField = masterFieldId ? jobFields[String(masterFieldId)] : null;
                            const fieldOptions = masterField?.options;
                            // Normalize options to ensure they are objects { label, value }
                            const normalizedOptions = Array.isArray(fieldOptions)
                              ? fieldOptions.map((opt: any) => typeof opt === 'string' ? { label: opt, value: opt } : opt)
                              : [];
                            const isDropdown = normalizedOptions.length > 0;

                            // Determine editing persistence for array items
                            const firstMasterId = colItem.linkedMasterFields?.[0];
                            const firstQId = colItem.linkedJobQuestionIds?.[0];
                            let arrayPersist = null;
                            let arrayEditId = row.entityId;

                            if (firstMasterId) {
                              const mDef = jobFields[String(firstMasterId)];
                              arrayPersist = mDef?.sources?.find(s => s.source_type === entityCategory) || mDef?.sources?.[0];
                            } else if (firstQId) {
                              arrayPersist = { table: 'tm_tasks', path: `job_specific_answers->>'${firstQId}'`, linking_variable: 'id' };
                              arrayEditId = taskId;
                            }

                            return (
                              <TableRow key={uniqueKey} className={cn("group border-b border-slate-100", isItemEditing ? "bg-blue-50" : "hover:bg-slate-50")}>
                                <TableCell className="px-2 py-2 text-center text-xs font-mono text-slate-400 border-r bg-slate-50/30">
                                  {rowIndex + 1}.{colIndex + 1}
                                </TableCell>
                                <TableCell className="px-4 py-2 border-r relative">
                                  <div className="flex items-center gap-2 pl-6 relative">
                                    <div className="absolute left-3 top-0 bottom-0 w-px bg-blue-100"></div>
                                    <div className="absolute left-3 top-1/2 w-3 h-px bg-blue-200"></div>
                                    <span className="text-xs text-slate-700 font-medium">{colItem.displayName || colItem.variableName}</span>
                                  </div>
                                </TableCell>
                                <TableCell className="px-4 py-2">
                                  <Badge variant="outline" className="text-[8px] h-4 uppercase">{colItem.sourceLogic || 'priority'}</Badge>
                                </TableCell>
                                <TableCell className="px-4 py-1">
                                  {isItemEditing ? (
                                    <div className="flex items-center gap-2">
                                      {/* --- MODIFIED INPUT RENDER LOGIC --- */}
                                      {isDropdown ? (
                                        <Select
                                          value={editValue}
                                          onValueChange={(val) => setEditValue(val)}
                                        >
                                          <SelectTrigger className="h-7 text-xs border-blue-400 w-full bg-white">
                                            <SelectValue placeholder="Select..." />
                                          </SelectTrigger>
                                          <SelectContent>
                                            {normalizedOptions.map((opt: any) => (
                                              <SelectItem key={opt.value} value={opt.value}>
                                                {opt.label}
                                              </SelectItem>
                                            ))}
                                          </SelectContent>
                                        </Select>
                                      ) : (
                                        <Input
                                          autoFocus
                                          value={editValue}
                                          onChange={e => setEditValue(e.target.value)}
                                          onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') cancelEditing(); }}
                                          className="h-7 text-xs border-blue-400"
                                        />
                                      )}
                                      {/* --- END MODIFICATION --- */}

                                      <Button
                                        size="icon"
                                        // Update saveEdit to pass dropdown options so it can save the Label if required
                                        onClick={() => saveEdit(isDropdown, normalizedOptions)}
                                        className="h-7 w-7 bg-green-600 shrink-0"
                                      >
                                        <Check className="h-3 w-3" />
                                      </Button>
                                      <Button size="icon" variant="ghost" onClick={cancelEditing} className="h-7 w-7 text-red-500 shrink-0"><X className="h-3 w-3" /></Button>
                                    </div>
                                  ) : (
                                    (() => {
                                      const mIds = colItem.linkedMasterFields || [];
                                      const qIds = colItem.linkedJobQuestionIds || [];
                                      const totalSources = mIds.length + qIds.length;

                                      if (totalSources > 1) {
                                        return (
                                          <Popover>
                                            <PopoverTrigger asChild>
                                              <div className={cn(
                                                "text-xs h-6 flex items-center px-2 rounded cursor-pointer border border-dashed border-blue-200 bg-blue-50/20 hover:bg-blue-50 transition-colors",
                                                isItemMissing ? "text-red-500 italic" : "text-slate-900"
                                              )}>
                                                <span className="truncate flex-1">{isItemMissing ? 'Missing' : rawValue}</span>
                                                <ChevronDown className="h-3 w-3 ml-2 text-blue-400 shrink-0" />
                                              </div>
                                            </PopoverTrigger>
                                            <PopoverContent className="w-72 p-0 shadow-xl border-blue-100" align="end">
                                              <div className="p-2 bg-slate-50 border-b flex justify-between items-center">
                                                <span className="text-[9px] font-bold text-slate-500 uppercase tracking-tight">Array Row Sources</span>
                                                <Badge className="text-[8px] h-4 bg-blue-100 text-blue-700 border-blue-200 uppercase">{colItem.sourceLogic || 'priority'}</Badge>
                                              </div>
                                              <div className="p-1 space-y-1">
                                                {mIds.map((mid, mIdx) => {
                                                  const mDef = jobFields[String(mid)];
                                                  const mSource = mDef?.sources?.find(s => s.source_type === entityCategory) || mDef?.sources?.[0];
                                                  const val = getFieldValue(String(mid), String(row.entityId));

                                                  return (
                                                    <div key={`am-${mid}`} className="flex items-center justify-between p-2 hover:bg-slate-50 rounded border border-transparent hover:border-slate-200 group">
                                                      <div className="flex flex-col min-w-0">
                                                        <span className="text-[9px] font-bold text-blue-600 flex items-center gap-1">
                                                          <Database className="h-2.5 w-2.5" /> Source {mIdx + 1}
                                                        </span>
                                                        <span className="text-[11px] font-medium truncate text-slate-700">{mDef?.label}</span>
                                                        <span className="text-[10px] text-slate-400 italic truncate">{isValidValue(val) ? val : 'Empty'}</span>
                                                      </div>
                                                      <Button
                                                        size="sm" variant="ghost" className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100"
                                                        onClick={() => mSource && startEditing(uniqueKey, mIdx, mSource.table, mSource.path, isValidValue(val) ? val : '', row.entityId, mSource.linking_variable)}
                                                      >
                                                        <Edit3 className="h-3 w-3 text-blue-500" />
                                                      </Button>
                                                    </div>
                                                  );
                                                })}

                                                {qIds.map((qid, qIdx) => {
                                                  const qDef = requirementJobQuestions.find(q => String(q.id) === String(qid));
                                                  const answers = sourceData['tm_tasks']?.[String(taskId)]?.job_specific_answers || {};
                                                  const val = answers[String(qid)] ?? answers[Number(qid)];

                                                  return (
                                                    <div key={`aq-${qid}`} className="flex items-center justify-between p-2 hover:bg-slate-50 rounded border border-transparent hover:border-slate-200 group">
                                                      <div className="flex flex-col min-w-0">
                                                        <span className="text-[9px] font-bold text-purple-600 flex items-center gap-1">
                                                          <HelpCircle className="h-2.5 w-2.5" /> Question
                                                        </span>
                                                        <span className="text-[11px] font-medium truncate text-slate-700">{qDef?.label || qid}</span>
                                                        <span className="text-[10px] text-slate-400 italic truncate">{isValidValue(val) ? val : 'Empty'}</span>
                                                      </div>
                                                      <Button
                                                        size="sm" variant="ghost" className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100"
                                                        onClick={() => startEditing(uniqueKey, 99 + qIdx, 'tm_tasks', `job_specific_answers->>'${qid}'`, isValidValue(val) ? val : '', taskId, 'id')}
                                                      >
                                                        <Edit3 className="h-3 w-3 text-blue-500" />
                                                      </Button>
                                                    </div>
                                                  );
                                                })}
                                              </div>
                                            </PopoverContent>
                                          </Popover>
                                        );
                                      } else {
                                        return (
                                          <div
                                            className={cn(
                                              "text-xs h-6 flex items-center px-2 rounded cursor-pointer hover:bg-white border border-transparent hover:border-blue-200 transition-colors",
                                              isItemMissing ? "text-red-500 italic" : "text-slate-900"
                                            )}
                                            onClick={() => {
                                              if (!arrayPersist) return;
                                              startEditing(uniqueKey, 0, arrayPersist.table, arrayPersist.path, isItemMissing ? '' : rawValue, String(arrayEditId), arrayPersist.linking_variable || 'id');
                                            }}
                                          >
                                            <span className="truncate">{isItemMissing ? 'Missing' : rawValue}</span>
                                            {arrayPersist && <Edit3 className="h-3 w-3 ml-auto text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity" />}
                                          </div>
                                        );
                                      }
                                    })()
                                  )}
                                </TableCell>
                              </TableRow>
                            );
                          })
                        ))}
                      </React.Fragment>
                    );
                  }

                  // =========================================================
                  // CASE: DOCUMENT FIELDS
                  // =========================================================
                  if (field.fieldType === 'document') {
                    const targetId = field.targetId;
                    const foundDoc = documentFiles.find(d => field.linkedKycDocuments?.includes(d.document_id) && String(d.owner_id) === String(targetId));

                    return (
                      <TableRow key={fIdx} className="group border-b border-slate-200 hover:bg-slate-50">
                        <TableCell className="px-2 py-2 text-center text-xs font-mono text-slate-400 border-r bg-slate-50">{fIdx + 1}</TableCell>
                        <TableCell className="px-4 py-2 border-r">
                          <div className="flex items-center gap-2">
                            <Paperclip className="h-4 w-4 text-amber-600" />
                            <span className="text-sm font-semibold text-slate-900">{field.efnsDisplayName || field.variableName}</span>
                          </div>
                        </TableCell>
                        <TableCell className="px-4 py-2">
                          <Badge variant="outline" className="text-[9px] border-amber-200 text-amber-700 bg-amber-50 uppercase">Asset Mapping</Badge>
                        </TableCell>
                        <TableCell className="px-4 py-2 border-r">
                          {foundDoc ? (
                            <div className="flex items-center gap-2">
                              <Badge className="bg-green-600 text-white h-6">Available</Badge>
                              <Button size="sm" variant="outline" onClick={() => handlePreviewDocument(foundDoc)} className="h-6 px-2 text-[10px]">
                                <Eye className="h-3 w-3 mr-1" /> Preview
                              </Button>
                            </div>
                          ) : <Badge variant="destructive" className="h-6">Missing</Badge>}
                        </TableCell>
                      </TableRow>
                    );
                  }

                  // =========================================================
                  // CASE: STANDARD FIELDS (Text, Number, Date, Computed)
                  // =========================================================
                  const isValueMissing = field.isMissing;
                  const mIds = field.linkedMasterFields || [];
                  const qIds = field.linkedJobQuestionIds || [];

                  // Logic for editing: We map the "Edit" action to the highest priority source
                  let persistenceSource = null;
                  let editTargetId = field.targetId;

                  if (mIds.length > 0) {
                    const mDef = jobFields[String(mIds[0])];
                    persistenceSource = mDef?.sources?.find(s => s.source_type === entityCategory) || mDef?.sources?.[0];
                  } else if (qIds.length > 0) {
                    persistenceSource = { table: 'tm_tasks', path: `job_specific_answers->>'${qIds[0]}'`, linking_variable: 'id' };
                    editTargetId = taskId;
                  }

                  return (
                    <TableRow key={fIdx} className={cn("group border-b border-slate-200 transition-colors", isEditing ? "bg-blue-50/50" : (field.fieldType === 'computed' ? "bg-purple-50/10" : "hover:bg-blue-50"))}>
                      <TableCell className="px-2 py-2 text-center text-xs font-mono text-slate-400 border-r bg-slate-50">{fIdx + 1}</TableCell>
                      <TableCell className="px-4 py-2 border-r">
                        <div className="flex flex-col">
                          <span className="text-sm font-semibold text-slate-900">{field.efnsDisplayName || field.variableName}</span>
                          <span className="text-[10px] text-slate-400 font-mono tracking-tighter">{field.variableName}</span>
                        </div>
                      </TableCell>

                      <TableCell className="px-4 py-2">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-1.5">
                            {field.customFieldSource || 'System'}
                            <div className="flex flex-col gap-1">
                              {field.linkedMasterFields?.length > 0 && (
                                <Badge variant="outline" className="text-[8px] h-5 border-blue-200 text-blue-700 bg-blue-50">
                                  Master Field
                                </Badge>
                              )}
                              {field.linkedJobQuestionIds?.length > 0 && (
                                <Badge variant="outline" className="text-[8px] h-5 border-purple-200 text-purple-700 bg-purple-50">
                                  Job Question
                                </Badge>
                              )}
                              {(!field.linkedMasterFields?.length && !field.linkedJobQuestionIds?.length) && (
                                <Badge variant="outline" className="text-[8px] h-5 border-slate-200 text-slate-600">
                                  Requirement
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                      </TableCell>

                      <TableCell className="px-4 py-1 border-r h-full">
                        {isEditing ? (
                          <div className="flex items-center gap-2">
                            <Input autoFocus value={editValue} onChange={e => setEditValue(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') cancelEditing(); }} className="h-8 text-sm border-blue-400" />
                            <Button size="icon" onClick={() => saveEdit()} className="h-8 w-8 bg-green-600 hover:bg-green-700"><Check className="h-4 w-4" /></Button>
                            <Button size="icon" variant="ghost" onClick={cancelEditing} className="h-8 w-8 text-red-500"><X className="h-4 w-4" /></Button>
                          </div>
                        ) : (
                          (mIds.length + qIds.length) > 1 ? (
                            /* --- MULTI-SOURCE SELECTOR --- */
                            <Popover>
                              <PopoverTrigger asChild>
                                <div className={cn(
                                  "text-sm h-7 flex items-center px-2 rounded cursor-pointer border border-dashed border-blue-300 bg-blue-50/30 hover:bg-blue-50 transition-colors",
                                  isValueMissing ? "text-red-600 font-medium italic" : "text-slate-900"
                                )}>
                                  {field.resolvedValue}
                                  <ChevronDown className="h-3 w-3 ml-auto text-blue-500" />
                                </div>
                              </PopoverTrigger>
                              <PopoverContent className="w-80 p-0 shadow-xl border-blue-100" align="end">
                                <div className="p-2 bg-slate-50 border-b text-[10px] font-bold text-slate-500 uppercase">
                                  Linked Sources (Priority Order)
                                </div>
                                <div className="p-1 space-y-1">
                                  {/* List Master Fields */}
                                  {mIds.map((mid, idx) => {
                                    const mDef = jobFields[String(mid)];
                                    const source = mDef?.sources?.find(s => s.source_type === entityCategory) || mDef?.sources?.[0];
                                    const sourceVal = getFieldValue(String(mid), String(field.targetId));

                                    return (
                                      <div key={`m-${mid}`} className="flex items-center justify-between p-2 hover:bg-slate-50 rounded border border-transparent hover:border-slate-200 group">
                                        <div className="flex flex-col min-w-0">
                                          <span className="text-[10px] font-bold text-blue-600 flex items-center gap-1">
                                            <Database className="h-3 w-3" /> DB FIELD {idx + 1}
                                          </span>
                                          <span className="text-xs font-medium truncate text-slate-700">{mDef?.label}</span>
                                          <span className="text-[11px] text-slate-500 truncate italic">{isValidValue(sourceVal) ? sourceVal : 'Empty'}</span>
                                        </div>
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100"
                                          onClick={() => source && startEditing(field.variableName, idx, source.table, source.path, isValidValue(sourceVal) ? sourceVal : '', field.targetId, source.linking_variable)}
                                        >
                                          <Edit3 className="h-3 w-3 text-blue-500" />
                                        </Button>
                                      </div>
                                    );
                                  })}

                                  {/* List Job Questions */}
                                  {qIds.map((qid, idx) => {
                                    const qDef = requirementJobQuestions.find(q => String(q.id) === String(qid));
                                    const sourceVal = getFieldValue(field.variableName, String(field.targetId)); // Simple for demo

                                    return (
                                      <div key={`q-${qid}`} className="flex items-center justify-between p-2 hover:bg-slate-50 rounded border border-transparent hover:border-slate-200 group">
                                        <div className="flex flex-col min-w-0">
                                          <span className="text-[10px] font-bold text-purple-600 flex items-center gap-1">
                                            <HelpCircle className="h-3 w-3" /> QUESTION
                                          </span>
                                          <span className="text-xs font-medium truncate text-slate-700">{qDef?.label || qid}</span>
                                          <span className="text-[11px] text-slate-500 truncate italic">{isValidValue(sourceVal) ? sourceVal : 'Empty'}</span>
                                        </div>
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100"
                                          onClick={() => startEditing(field.variableName, 99 + idx, 'tm_tasks', `job_specific_answers->>'${qid}'`, isValidValue(sourceVal) ? sourceVal : '', taskId, 'id')}
                                        >
                                          <Edit3 className="h-3 w-3 text-blue-500" />
                                        </Button>
                                      </div>
                                    );
                                  })}
                                </div>
                              </PopoverContent>
                            </Popover>
                          ) : (
                            /* --- SINGLE SOURCE: DIRECT EDIT --- */
                            <div
                              className={cn(
                                "text-sm h-7 flex items-center px-2 rounded -my-1 transition-colors relative",
                                persistenceSource ? "cursor-pointer border border-transparent hover:border-blue-400 hover:bg-blue-50" : "cursor-default",
                                isValueMissing ? "text-red-600 font-medium italic" : "text-slate-900"
                              )}
                              onClick={() => {
                                if (!persistenceSource) return;
                                startEditing(field.variableName, 0, persistenceSource.table, persistenceSource.path, isValueMissing ? '' : field.resolvedValue, String(editTargetId), persistenceSource.linking_variable || 'id');
                              }}
                            >
                              {field.resolvedValue}
                              {persistenceSource && !isEditing && <Edit3 className="h-3 w-3 ml-auto text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity absolute right-2" />}
                            </div>
                          )
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

    return (
      <div className="space-y-4">
        {/* ── eTA Screenshot saved doc banner ──────────────────────────────── */}
        {savedScreenshotDoc && (
          <Card className="border-green-300 bg-green-50/40 shadow-sm">
            <CardContent className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-green-100 text-green-600">
                  <CheckCircle2 className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="font-bold text-sm text-slate-900">eTA Kenya Confirmation Screenshot</h4>
                  <p className="text-[10px] text-slate-500">{savedScreenshotDoc.file_name}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge className="bg-green-600 text-white">Saved</Badge>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 px-2 text-xs"
                  onClick={() => {
                    setPreviewingDocuments({
                      document_display_name: 'eTA Kenya Confirmation Screenshot',
                      documents: [savedScreenshotDoc],
                      person_full_name: individualName || getPrimaryTargetEntityId(),
                      requirementId: ETA_SCREENSHOT_DOCUMENT_ID,
                    });
                    setShowPreviewModal(true);
                  }}
                >
                  <Eye className="h-3 w-3 mr-1" /> View
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {allDocFields.length === 0 && !savedScreenshotDoc && (
          <div className="p-12 text-center text-slate-400">No document assets configured.</div>
        )}

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
      </div>
    );
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="max-w-[95vw] w-[1400px] h-[90vh] flex flex-col p-0 overflow-hidden border-none shadow-2xl bg-white">
          {/* HEADER WITH CLOSE BUTTON */}
          <div className="p-6 border-b bg-gradient-to-r from-blue-600 to-blue-500 flex items-center justify-between shadow-lg relative">
            <button
              onClick={onClose}
              className="absolute right-6 top-6 rounded-sm opacity-70 ring-offset-white transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 disabled:pointer-events-none z-50"
            >
              <X className="h-5 w-5 text-white" />
              <span className="sr-only">Close</span>
            </button>

            <div className="flex items-center gap-4 pr-8">
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
                  <span>ID: {getPrimaryTargetEntityId() || 'N/A'}</span>
                  {/* ── Screenshot saved indicator in header ─────────────── */}
                  {savedScreenshotDoc && (
                    <span className="flex items-center gap-1 bg-green-500/20 border border-green-400/30 px-2 py-0.5 rounded-full text-green-200 text-xs">
                      <CheckCircle2 className="h-3 w-3" /> Screenshot Saved
                    </span>
                  )}
                  {isSavingScreenshot && (
                    <span className="flex items-center gap-1 bg-white/10 px-2 py-0.5 rounded-full text-white/70 text-xs">
                      <Loader2 className="h-3 w-3 animate-spin" /> Saving screenshot...
                    </span>
                  )}
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
                  value={getPrimaryTargetEntityId()}
                  onChange={(e) => {
                    const primaryEntityType = getPrimaryEntityType();
                    if (primaryEntityType === 'principal') {
                      setCurrentIndividualId(e.target.value);
                    }
                  }}
                  placeholder="ID Number..."
                  className="w-28 outline-none text-sm font-semibold text-white bg-transparent placeholder:text-white/50"
                  disabled={getPrimaryEntityType() !== 'principal'}
                />
              </div>
            </div>
          </div>

          {/* CONTENT AREA */}
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
                      <TabsTrigger value="documents" className="text-xs">
                        <FileText className="h-3 w-3 mr-2" />Documents
                        {savedScreenshotDoc && <span className="ml-1 h-2 w-2 rounded-full bg-green-500 inline-block" />}
                      </TabsTrigger>
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

          {/* UPDATED FOOTER */}
          <div className="p-6 border-t bg-white flex justify-between items-center shrink-0 shadow-[0_-4px_10px_rgba(0,0,0,0.03)]">
            <div className="flex flex-col">
              <span className="text-xs text-slate-400 font-semibold uppercase tracking-wide">Automation Ready</span>
              <span className="text-sm text-blue-600 font-bold truncate max-w-[400px]">
                {selectedMapping?.automation?.name || "Select Workflow"}
              </span>
            </div>
            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={onClose}
                className="px-6 font-semibold uppercase text-xs tracking-wide text-slate-500 hover:text-slate-700"
              >
                Close
              </Button>
              <Button
                onClick={handleRunAutomation}
                disabled={isAutomationRunning || isSavingScreenshot}
                className="px-10 bg-blue-600 hover:bg-blue-700 h-11 text-white font-bold uppercase text-xs tracking-wide transition-all"
              >
                {(isAutomationRunning || isSavingScreenshot) ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Zap className="mr-2 h-4 w-4 fill-white" />
                )}
                {isSavingScreenshot ? 'Saving Screenshot...' : 'Execute Workflow'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Document Preview Modal */}
      <Dialog open={showPreviewModal} onOpenChange={setShowPreviewModal}>
        <DialogContent className="max-w-[95vw] w-full max-h-[95vh] flex flex-col p-0 overflow-hidden bg-slate-50">
          {showPreviewModal && previewingDocuments && (
            <>
              <DialogHeader className="p-4 border-b bg-white shrink-0 relative">
                <button
                  onClick={() => setShowPreviewModal(false)}
                  className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-white transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2"
                >
                  <X className="h-5 w-5 text-slate-600" />
                  <span className="sr-only">Close</span>
                </button>

                <div className="flex items-center justify-between pr-8">
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

              <div className="p-6 border-t bg-white flex justify-between items-center shrink-0 shadow-[0_-4px_10px_rgba(0,0,0,0.03)]">
                <div className="flex flex-col">
                  <span className="text-xs text-slate-400 font-semibold uppercase tracking-wide">Document Preview</span>
                  <span className="text-sm text-blue-600 font-bold">
                    {previewingDocuments?.document_display_name || 'Document'}
                  </span>
                </div>
                <Button
                  variant="outline"
                  onClick={() => setShowPreviewModal(false)}
                  className="px-6 font-semibold uppercase text-xs tracking-wide text-slate-500 hover:text-slate-700"
                >
                  Close
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}