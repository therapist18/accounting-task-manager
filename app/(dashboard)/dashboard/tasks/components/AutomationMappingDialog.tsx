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
  ArrowUpDown, Filter, Check, List, ChevronDown
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
    if (isFetchingRef.current) {
      return;
    }
    lastFetchKey.current = fetchKey;
    isFetchingRef.current = true;
    setIsLoadingData(true);
    try {
      const standardFetchQueue = new Map<string, { ids: Set<string>, linkingVariable: string }>();
      const computedRequirements = {
        individualIds: new Set<string>(),
        documentIds: new Set<string>()
      };
      const activeAutomation = webData.find(w => w.automationId === selectedAutomationId);
      const fieldsToProcess = activeAutomation?.fields || [];
      const computedMasterFields: any[] = [];

      fieldsToProcess.forEach((field: any) => {
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
          // Handle both linkedMasterFields (array) and linkedMasterFieldId (single value)
          const fieldIds = col.linkedMasterFields || (col.linkedMasterFieldId ? [col.linkedMasterFieldId] : []);
          const mid = fieldIds[0] || field.linkedMasterFields?.[0] || field.masterFieldIds?.[0];
          if (!mid) return;

          const jobField = jobFields[mid];
          if (jobField) {
            if (jobField.is_computed || jobField.computed_config?.is_computed) {
              const extractionMode = col.extractionMode || field.extractionMode || 'latest';
              const config = jobField.computed_config || {};
              const docIds = config.document_ids || [];

              docIds.forEach((did: string) => computedRequirements.documentIds.add(did));
              entityIds.forEach(id => computedRequirements.individualIds.add(String(id)));

              entityIds.forEach((id: any) => {
                computedMasterFields.push({
                  field: jobField,
                  entityId: String(id),
                  extractionMode: extractionMode
                });
              });

            } else {
              jobField.sources?.forEach((source: any) => {
                if (source.table && entityIds.length > 0) {

                  let entityCategory = 'individual';
                  if (field.entityTypes?.includes('company')) {
                    entityCategory = 'company';
                  }

                  let linkVar = source.linking_variable;
                  if (!linkVar) {
                    if (source.table === 'acc_portal_directors_documents') linkVar = 'director_id';
                    else if (source.table === 'acc_portal_company_documents') linkVar = 'company_id';
                    else if (source.table === 'tm_tasks') linkVar = 'id';
                    else linkVar = 'id';
                  }

                  if (!standardFetchQueue.has(source.table)) {
                    standardFetchQueue.set(source.table, {
                      ids: new Set(),
                      linkingVariable: linkVar
                    });
                  }

                  const queueItem = standardFetchQueue.get(source.table);
                  if (queueItem && queueItem.linkingVariable === linkVar) {
                    if (source.table === 'tm_tasks' && linkVar === 'id') {
                      if (taskId) queueItem.ids.add(String(taskId));
                    } else {
                      entityIds.forEach(id => queueItem.ids.add(String(id)));
                    }
                  }
                }
              });
            }
          }
        });
      });

      const newSourceData: Record<string, Record<string, any>> = {};
      const documentCache = { documents: [], docTypes: [] };
      const fetchPromises = [];

      for (const [table, { ids, linkingVariable }] of standardFetchQueue.entries()) {
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
                });

                if (table === 'acc_portal_directors_documents') {
                  documentCache.documents.push(...data);
                }
              }
            })
        );
      }

      await Promise.all(fetchPromises);

      const fullDocsDirectorIds = standardFetchQueue.get('acc_portal_directors_documents')?.ids;
      const neededDocTypes = Array.from(computedRequirements.documentIds);
      const allNeededPeople = Array.from(computedRequirements.individualIds);

      const remainingPeople = allNeededPeople.filter(pid =>
        !fullDocsDirectorIds || !fullDocsDirectorIds.has(pid)
      );

      const computedPromises = [];

      if (neededDocTypes.length > 0) {
        computedPromises.push(
          supabase.from('acc_portal_kyc').select('*').in('id', neededDocTypes)
            .then(({ data }) => { if (data) documentCache.docTypes = data; })
        );

        if (remainingPeople.length > 0) {
          computedPromises.push(
            supabase.from('acc_portal_directors_documents')
              .select('*')
              .in('director_id', remainingPeople)
              .in('document_id', neededDocTypes)
              .neq('status', 'deleted')
              .then(({ data }) => {
                if (data) documentCache.documents.push(...data);
              })
          );
        }
      }

      await Promise.all(computedPromises);

      if (computedMasterFields.length > 0) {
        const newComputedValues: Record<string, any> = {};
        for (const item of computedMasterFields) {
          const { field, entityId, extractionMode } = item;
          const config = field.computed_config || {};
          const docs = config.document_ids || [];
          const source = field.sources?.[0];
          let computedValue: any;

          if (config.computed_function) {
            // Only pass fieldPath for functions that need document field extraction
            const functionsNeedingFieldPath = [
              'getLatestDocumentNumber',
              'getLatestWorkPermit',
              'extractFieldFromLatestDocument',
              'extractFieldFromAllDocuments'
            ];
            const fieldPathToUse = functionsNeedingFieldPath.includes(config.computed_function) && source?.path
              ? source.path
              : undefined;

            // Check if this is an arithmetic or date calculation function
            const arithmeticFunctions = ['calculateArithmetic', 'calculateDateDifference'];
            const arithmeticConfig = config.arithmeticConfig;

            if (arithmeticFunctions.includes(config.computed_function) && arithmeticConfig) {
              // For arithmetic functions, we need to resolve field IDs to actual document paths
              let resolvedArithmeticConfig: any = { ...arithmeticConfig };

              // Handle startDatePath/endDatePath (for calculateDateDifference)
              // or field1Path/field2Path (for calculateArithmetic)
              const field1Key = arithmeticConfig.startDatePath || arithmeticConfig.field1Path;
              const field2Key = arithmeticConfig.endDatePath || arithmeticConfig.field2Path;

              if (field1Key) {
                // Check if it's a field ID (number) or already a path (string with ->)
                if (typeof field1Key === 'number' || !String(field1Key).includes('->')) {
                  // It's a field ID, look up the field to get its path
                  const field1 = jobFields[String(field1Key)];
                  if (field1?.sources?.[0]?.path) {
                    resolvedArithmeticConfig.field1Path = field1.sources[0].path;
                  } else {
                    // Assume it's in extracted_details
                    resolvedArithmeticConfig.field1Path = `extracted_details->>'${field1?.field_key || field1Key}'`;
                  }
                } else {
                  resolvedArithmeticConfig.field1Path = field1Key;
                }
              }

              if (field2Key) {
                if (typeof field2Key === 'number' || !String(field2Key).includes('->')) {
                  const field2 = jobFields[String(field2Key)];
                  if (field2?.sources?.[0]?.path) {
                    resolvedArithmeticConfig.field2Path = field2.sources[0].path;
                  } else {
                    resolvedArithmeticConfig.field2Path = `extracted_details->>'${field2?.field_key || field2Key}'`;
                  }
                } else {
                  resolvedArithmeticConfig.field2Path = field2Key;
                }
              }

              // For calculateDateDifference, we need to pass startDatePath and endDatePath
              if (config.computed_function === 'calculateDateDifference') {
                console.log('[DEBUG] calculateDateDifference - Original config:', {
                  arithmeticConfig,
                  startDatePath: arithmeticConfig.startDatePath,
                  endDatePath: arithmeticConfig.endDatePath,
                  unit: arithmeticConfig.unit
                });

                console.log('[DEBUG] calculateDateDifference - Resolved paths:', {
                  resolvedStartDatePath: resolvedArithmeticConfig.field1Path,
                  resolvedEndDatePath: resolvedArithmeticConfig.field2Path,
                  jobFieldsAvailable: Object.keys(jobFields).length
                });

                // Log field details for debugging
                if (arithmeticConfig.startDatePath) {
                  const startField = jobFields[String(arithmeticConfig.startDatePath)];
                  console.log('[DEBUG] Start field details:', {
                    fieldId: arithmeticConfig.startDatePath,
                    fieldData: startField,
                    sources: startField?.sources
                  });
                }

                if (arithmeticConfig.endDatePath) {
                  const endField = jobFields[String(arithmeticConfig.endDatePath)];
                  console.log('[DEBUG] End field details:', {
                    fieldId: arithmeticConfig.endDatePath,
                    fieldData: endField,
                    sources: endField?.sources
                  });
                }

                computedValue = await executeComputedField(
                  config.computed_function,
                  entityId,
                  docs,
                  undefined, // fieldPath not needed for date difference
                  extractionMode,
                  documentCache,
                  {
                    startDatePath: resolvedArithmeticConfig.field1Path,
                    endDatePath: resolvedArithmeticConfig.field2Path,
                    unit: resolvedArithmeticConfig.unit
                  }
                );

                console.log('[DEBUG] calculateDateDifference - Result:', computedValue);
              } else {
                // For other arithmetic functions, use field1Path and field2Path
                computedValue = await executeComputedField(
                  config.computed_function,
                  entityId,
                  docs,
                  resolvedArithmeticConfig.field1Path,
                  extractionMode,
                  documentCache,
                  {
                    field2Path: resolvedArithmeticConfig.field2Path,
                    operation: resolvedArithmeticConfig.operation,
                    operand: resolvedArithmeticConfig.operand,
                    unit: resolvedArithmeticConfig.unit
                  }
                );
              }
            } else {
              computedValue = await executeComputedField(
                config.computed_function,
                entityId,
                docs,
                fieldPathToUse,
                extractionMode,
                documentCache
              );
            }

            if (typeof computedValue === 'string' && computedValue === '[object Object]') {
              console.error('[fetchSourceData] CRITICAL: Object was already converted to "[object Object]" before this point!');
            }
          } else if (source && source.path && source.source_type === 'document') {
            computedValue = await executeComputedField(
              'extractFieldFromLatestDocument',
              entityId,
              docs,
              source.path,
              extractionMode,
              documentCache
            );
          } else {
            computedValue = "No Config";
          }
          const cacheKey = `${field.id}_${entityId}_${extractionMode}`;
          let storageValue = computedValue;
          if (typeof computedValue === 'object' && computedValue !== null && !Array.isArray(computedValue)) {
            storageValue = JSON.stringify(computedValue);
          }
          newComputedValues[cacheKey] = storageValue;
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

  const getFieldValue = (fieldId: string, entityId: string, sourceIdx: number = 0, extractionMode: string = 'latest', preserveArray: boolean = false) => {
    const field = jobFields[fieldId];
    if (!field) return "Missing Config";
    if (field.is_computed || field.computed_config?.is_computed) {
      const key = `${field.id}_${entityId}_${extractionMode}`;
      const val = masterFieldComputedValues[key];
      if (val === undefined) return "Computing...";
      if (typeof val === 'object' && val !== null) {
        if (Array.isArray(val)) {
          return preserveArray ? val : val.join(', ');
        } else {
          return JSON.stringify(val);
        }
      }
      if (val === '[object Object]') {
        return "Computed Value Error: Object Detected";
      }

      return String(val);
    }
    const source = field.sources?.[sourceIdx];
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
      const activeWeb = webData.find(w => w.automationId === selectedAutomationId);
      const computedFields = activeWeb?.fields?.filter((f: any) => f.fieldType === 'computed')
        ?.map((f: any) => ({ variableName: f.variableName, computedFunction: f.computedFunction, computedDocuments: f.computedDocuments || [] })) || [];
      if (computedFields.length === 0) { setComputedFieldsPreview({}); return; }
      setIsComputing(true);
      try {
        const results = await processComputedFields(currentIndividualId, computedFields);
        setComputedFieldsPreview(results);
      } catch (error) {
        console.error('Error auto-computing fields:', error);
      } finally {
        setIsComputing(false);
      }
    };
    const timer = setTimeout(runComputation, 500);
    return () => clearTimeout(timer);
  }, [currentIndividualId, selectedAutomationId, webData]);

  // --- ACTION HANDLERS ---
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
                  val = getSourceValue(field.sources[0].table, field.sources[0].path, String(id));
                  if (val === 'Missing') val = '';
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
        const values = masterIds.map((mid: string | number) => {
          let val = getFieldValue(String(mid), String(targetId), 0, f.extractionMode || 'latest');
          if (Array.isArray(val)) {
            val = val.join(', ');
          }
          if (f.fieldType === 'date' && val && val !== 'Missing' && val !== 'Computing...') {
            return formatDateValue(val, f.dateFormat);
          }
          return (val === 'Missing' || val === 'Computing...') ? null : val;
        }).filter(Boolean);

        if (values.length > 0) {
          formData[f.variableName] = values.length === 1 ? values[0] : values.join(' ');
        }
      });

      const computedFields = activeWeb?.fields?.filter((f: any) => f.fieldType === 'computed')
        ?.map((f: any) => ({ variableName: f.variableName, computedFunction: f.computedFunction, computedDocuments: f.computedDocuments || [] })) || [];

      if (computedFields.length > 0) {
        const computedResults = await processComputedFields(currentIndividualId, computedFields);
        Object.assign(formData, computedResults);
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

  const startEditing = (fieldId: string, sourceIdx: number, table: string, path: string, val: string, entityId: string, linkingVariable: string) => {
    setEditingCell({ fieldId, sourceIdx, table, path, entityId, linkingVariable });
    setEditValue(val === 'Missing' ? '' : val);
  };

  const cancelEditing = () => {
    setEditingCell(null);
    setEditValue('');
  }

  const saveEdit = async (isDropdown?: boolean, dropdownOptions?: { label: string, value: string }[]) => {
    if (!editingCell) return;
    const { table, path, entityId, linkingVariable } = editingCell;

    let valueToSave = editValue;

    if (isDropdown && dropdownOptions && dropdownOptions.length > 0) {
      const selectedOption = dropdownOptions.find(opt => opt.value === editValue);
      if (selectedOption) {
        valueToSave = selectedOption.label;
      }
    }
    setIsLoadingData(true);
    try {
      let queryField = 'id';
      if (table === 'acc_portal_directors_documents') queryField = 'director_id';
      else if (table === 'acc_portal_company_documents') queryField = 'company_id';

      const record = sourceData[table]?.[entityId];
      if (!record) throw new Error("Record not found in cache");

      const recordPK = record.id || record.director_id || record.company_id;
      if (record.director_id) queryField = 'director_id';
      else if (record.company_id) queryField = 'company_id';
      else queryField = 'id';

      const { data: existing } = await supabase.from(table).select('*').eq(queryField, recordPK).maybeSingle();
      const updated = updateJsonValue(existing || {}, path, valueToSave);

      const { data: updatedRecord, error } = await supabase
        .from(table)
        .update({ ...updated, updated_at: new Date().toISOString() })
        .eq(queryField, recordPK)
        .select()
        .single();

      if (error) throw error;

      if (updatedRecord) {
        setSourceData(prev => {
          const newTableData = { ...prev[table] };
          newTableData[entityId] = updatedRecord;
          return {
            ...prev,
            [table]: newTableData
          };
        });
      }

      toast({ title: 'Success', description: 'Field updated' });
    } catch (e) {
      console.error(e);
      toast({ title: 'Error', description: 'Update failed', variant: 'destructive' });
    } finally {
      setIsLoadingData(false);
      setEditingCell(null);
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

  // --- EXCEL-LIKE TABLE RENDER WITH ALL FIELD TYPES ---
  const renderFieldsTable = () => {
    if (!activeWebEntry?.fields || activeWebEntry.fields.length === 0) {
      return <div className="p-12 text-center text-slate-400 text-sm">No fields configured for this automation.</div>;
    }

    // Include ALL field types
    const allFields = activeWebEntry.fields || [];

    const processedFields = allFields.map(field => {
      let isMissing = false;

      if (field.fieldType === 'array') {
        const entityIds = resolveEntityIdsForArray(field, relationshipData);
        if (entityIds.length === 0) isMissing = true;
      } else if (field.fieldType === 'document') {
        const targetId = resolveTargetEntityId(field);
        const foundDoc = documentFiles.find(d => d.document_id === field.kycDocumentId && String(d.owner_id) === String(targetId));
        if (!foundDoc) isMissing = true;
      } else if (field.fieldType === 'computed') {
        const val = computedFieldsPreview[field.variableName];
        if (!val) isMissing = true;
      } else {
        const targetId = resolveTargetEntityId(field);
        if (!targetId) {
          isMissing = true;
        } else {
          const masterIds = field.linkedMasterFields || field.masterFieldIds || [];
          const mergedValue = masterIds.map((mid: string | number) => {
            const v = getFieldValue(String(mid), String(targetId), 0, field.extractionMode || 'latest');
            return Array.isArray(v) ? v.join(', ') : v;
          }).join(' ');
          if (!mergedValue || mergedValue === 'Missing' || mergedValue === '') isMissing = true;
        }
      }
      return { ...field, isMissing };
    });

    const missingCount = processedFields.filter(f => f.isMissing).length;

    const sortedFields = sortMissingFirst
      ? [...processedFields].sort((a, b) => (a.isMissing === b.isMissing ? 0 : a.isMissing ? -1 : 1))
      : processedFields;

    return (
      <div className="flex flex-col h-full">
        {/* STATS BAR */}
        <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-slate-200">
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-slate-600">
              {processedFields.length} Fields Total
            </span>
            {missingCount > 0 && (
              <Badge variant="destructive" className="h-6 px-2 text-xs">
                {missingCount} Missing
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

        {/* EXCEL-LIKE TABLE */}
        <div className="flex-1 overflow-hidden bg-white">
          <ScrollArea className="h-full">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-slate-100 border-b-2 border-slate-300">
                <TableRow>
                  <TableHead className="w-12 px-2 py-3 text-center text-xs font-bold text-slate-600 border-r border-slate-200">#</TableHead>
                  <TableHead className="w-80 px-4 py-3 text-left text-xs font-bold text-slate-700 border-r border-slate-200">
                    <div className="flex items-center gap-2">
                      FIELD NAME
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          // Toggle all source fields
                          const allFieldIds = sortedFields.map(f => f.variableName).filter(Boolean);
                          if (expandedSourceFields.size === allFieldIds.length) {
                            setExpandedSourceFields(new Set());
                          } else {
                            setExpandedSourceFields(new Set(allFieldIds));
                          }
                        }}
                        className="h-5 w-5 p-0 hover:bg-slate-200"
                      >
                        {expandedSourceFields.size > 0 ? (
                          <ChevronDown className="h-3 w-3" />
                        ) : (
                          <ChevronRight className="h-3 w-3" />
                        )}
                      </Button>
                    </div>
                  </TableHead>
                  <TableHead className="px-4 py-3 text-left text-xs font-bold text-slate-700">SOURCE</TableHead>
                  <TableHead className="px-4 py-3 text-left text-xs font-bold text-slate-700 border-r border-slate-200">CURRENT VALUE</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {sortedFields.map((field, fIdx) => {
                  const isEditing = editingCell?.fieldId === field.variableName;

                  // CASE: ARRAY FIELDS
                  if (field.fieldType === 'array') {
                    const entityIds = resolveEntityIdsForArray(field, relationshipData);
                    const arrayCount = entityIds.length;
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
                              <button
                                onClick={() => toggleArrayFieldExpansion(field.variableName)}
                                className="flex items-center gap-1 hover:bg-blue-100 rounded px-2 py-1 transition-colors"
                              >
                                <ChevronRight
                                  className={`h-4 w-4 text-blue-600 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                                />
                                <List className="h-4 w-4 text-blue-600" />
                              </button>
                              <span className="text-sm font-semibold text-slate-900">{field.efnsDisplayName || field.variableName}</span>
                              <Badge variant="outline" className="text-[10px] border-blue-300 text-blue-700 bg-blue-50">Array</Badge>
                            </div>
                          </TableCell>
                          <TableCell className="px-4 py-2 border-r border-slate-100">
                            <span className="text-xs text-slate-600">{arrayCount} entities • {field.arrayItems?.length || 0} columns</span>
                          </TableCell>
                          <TableCell className="px-4 py-2">
                            <button
                              onClick={() => toggleArrayFieldExpansion(field.variableName)}
                              className="text-xs text-blue-600 hover:text-blue-800 hover:underline italic"
                            >
                              {isExpanded ? 'Hide details' : 'View in original layout for full details'}
                            </button>
                          </TableCell>
                        </TableRow>

                        {isExpanded && (
                          <TableRow>
                            <TableCell colSpan={4} className="p-0 bg-gradient-to-r from-blue-50/50 to-indigo-50/50 border-b-2 border-blue-300">
                              <div className="p-6">
                                <div className="mb-4 flex items-center gap-3 pb-3 border-b-2 border-blue-200">
                                  <div className="h-8 w-1 bg-gradient-to-b from-blue-500 to-indigo-500 rounded-full"></div>
                                  <h4 className="text-base font-bold text-slate-800">Array Field Details</h4>
                                  <Badge variant="outline" className="text-xs border-blue-400 bg-blue-100 text-blue-700">
                                    {arrayData.length} {arrayData.length === 1 ? 'row' : 'rows'}
                                  </Badge>
                                </div>

                                {arrayData.length > 0 ? (
                                  <div className="border-2 border-blue-300 rounded-lg overflow-hidden shadow-sm">
                                    <Table>
                                      <TableHeader className="bg-gradient-to-r from-blue-100 to-indigo-100 border-b-2 border-blue-300">
                                        <TableRow>
                                          <TableHead className="px-4 py-3 text-left text-xs font-bold text-slate-800 border-r-2 border-blue-200 bg-blue-50/50 w-16">
                                            #
                                          </TableHead>
                                          {field.arrayItems?.map((item: any, idx: number) => (
                                            <TableHead
                                              key={idx}
                                              className={cn(
                                                "px-4 py-3 text-left text-xs font-bold text-slate-800",
                                                idx < field.arrayItems.length - 1 && "border-r-2 border-blue-200"
                                              )}
                                            >
                                              <div className="flex flex-col gap-1">
                                                <div className="flex items-center gap-2">
                                                  <div className="h-2 w-2 rounded-full bg-blue-500"></div>
                                                  <span>{item.name || item.header || getMasterFieldDisplayName((item.linkedMasterFields || [])[0] || item.linkedMasterFieldId)}</span>
                                                  {item.extractionMode === 'all' && (
                                                    <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 border-purple-300 text-purple-600 bg-purple-50">
                                                      MULTI
                                                    </Badge>
                                                  )}
                                                </div>
                                                {item.customFieldSource && (
                                                  <div className="text-[10px] text-emerald-600 font-medium flex items-center gap-1">
                                                    <span className="inline-block w-1 h-1 rounded-full bg-emerald-500"></span>
                                                    {item.customFieldSource}
                                                  </div>
                                                )}
                                              </div>
                                            </TableHead>
                                          ))}
                                        </TableRow>
                                      </TableHeader>
                                      <TableBody className="bg-white">
                                        {arrayData.map((row: any, rowIndex: number) => (
                                          <TableRow
                                            key={rowIndex}
                                            className={cn(
                                              "border-b border-blue-200 last:border-b-0 transition-colors hover:bg-blue-50/30",
                                              rowIndex % 2 === 0 ? "bg-white" : "bg-blue-50/10"
                                            )}
                                          >
                                            <TableCell className="px-4 py-3 text-xs font-semibold text-slate-600 border-r-2 border-blue-200 bg-blue-50/30">
                                              {row.index}
                                            </TableCell>
                                            {field.arrayItems?.map((item: any, colIndex: number) => {
                                              const columnKey = item.variableName || String((item.linkedMasterFields || [])[0] || item.linkedMasterFieldId || '');
                                              const value = row[columnKey];
                                              const isMissing = !value || value === '' || value === 'Missing Config';

                                              return (
                                                <TableCell
                                                  key={colIndex}
                                                  className={cn(
                                                    "px-4 py-3 text-xs",
                                                    colIndex < field.arrayItems.length - 1 && "border-r-2 border-blue-100",
                                                    isMissing ? "text-red-600 font-medium" : "text-slate-800"
                                                  )}
                                                >
                                                  {isMissing ? (
                                                    <span className="italic flex items-center gap-1">
                                                      <AlertCircle className="h-3 w-3" />
                                                      Missing
                                                    </span>
                                                  ) : (
                                                    value
                                                  )}
                                                </TableCell>
                                              );
                                            })}
                                          </TableRow>
                                        ))}
                                      </TableBody>
                                    </Table>
                                  </div>
                                ) : (
                                  <div className="text-center py-12 text-slate-400 text-sm border-2 border-dashed border-blue-200 rounded-lg bg-blue-50/20">
                                    <List className="h-8 w-8 mx-auto mb-2 opacity-30" />
                                    No data available for this array field
                                  </div>
                                )}
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
                        <TableCell className="px-2 py-2 text-center text-xs font-mono text-slate-400 border-r border-slate-100 bg-slate-50">
                          {fIdx + 1}
                        </TableCell>
                        <TableCell className="px-4 py-2 border-r border-slate-100">
                          <div className="flex items-center gap-2">
                            <Paperclip className="h-4 w-4 text-amber-600" />
                            <span className="text-sm font-semibold text-slate-900">{field.efnsDisplayName || field.variableName}</span>
                            <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-700 bg-amber-50">Document</Badge>
                          </div>
                        </TableCell>
                        <TableCell className="px-4 py-2 border-r border-slate-100">
                          {foundDoc ? (
                            <div className="flex items-center gap-2">
                              <Badge className="bg-green-600 text-white h-6">Available</Badge>
                              <a href={buildFileUrl(foundDoc)} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                                View <ExternalLink className="h-3 w-3" />
                              </a>
                            </div>
                          ) : (
                            <Badge variant="destructive" className="h-6">Missing</Badge>
                          )}
                        </TableCell>
                        <TableCell className="px-4 py-2">
                          <span className="text-xs text-slate-500">KYC: {field.kycDocumentId?.substring(0, 12)}...</span>
                        </TableCell>
                      </TableRow>
                    );
                  }
                  if (field.fieldType === 'computed') {
                    const computedValue = computedFieldsPreview[field.variableName];
                    return (
                      <TableRow key={fIdx} className="group border-b border-slate-200 bg-purple-50/20">
                        <TableCell className="px-2 py-2 text-center text-xs font-mono text-slate-400 border-r border-slate-100 bg-slate-50">
                          {fIdx + 1}
                        </TableCell>
                        <TableCell className="px-4 py-2 border-r border-slate-100">
                          <div className="flex items-center gap-2">
                            <Calculator className="h-4 w-4 text-purple-600" />
                            <span className="text-sm font-semibold text-slate-900">{field.efnsDisplayName || field.variableName}</span>
                            <Badge variant="outline" className="text-[10px] border-purple-300 text-purple-700 bg-purple-50">Computed</Badge>
                          </div>
                        </TableCell>
                        <TableCell className="px-4 py-2 border-r border-slate-100">
                          {isComputing ? (
                            <div className="flex items-center gap-2 text-xs text-slate-400">
                              <Loader2 className="h-3 w-3 animate-spin" /> Calculating...
                            </div>
                          ) : computedValue ? (
                            <span className="text-sm font-semibold text-green-700">{computedValue}</span>
                          ) : (
                            <span className="text-xs text-slate-400 italic">Pending...</span>
                          )}
                        </TableCell>
                        <TableCell className="px-4 py-2">
                          <div className="flex items-center gap-2">
                            <FunctionSquare className="h-3 w-3 text-purple-500" />
                            <span className="text-xs font-mono text-purple-700">{field.computedFunction}</span>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  }

                  const targetId = resolveTargetEntityId(field);
                  const isMissingEntity = !targetId;
                  const masterIds = field.linkedMasterFields || field.masterFieldIds || [];

                  const linkedJobField = jobFields[masterIds[0]];
                  const isDropdown = linkedJobField?.type === 'select';

                  const dropdownOptions = isDropdown
                    ? getDependentDropdownOptions(field, linkedJobField, String(targetId))
                    : [];

                  let entityCategory = 'individual';
                  if (field.entityTypes?.includes('company')) entityCategory = 'company';
                  if (targetId && (targetId === relationshipData?.company?.id || targetId === task?.company_id)) {
                    entityCategory = 'company';
                  }

                  const sources = masterIds.map((mid: string | number) => {
                    const f = jobFields[mid];
                    if (!f?.sources) return null;
                    let matchingSource = f.sources.find((s: any) => s.source_type === entityCategory);
                    if (!matchingSource) matchingSource = f.sources[0];
                    return matchingSource ? { ...matchingSource, label: f.label } : null;
                  }).filter(Boolean);

                  const sourcesDisplay = masterIds.map((mid: string | number) => {
                    const jobField = jobFields[mid];
                    if (!jobField) return null;
                    if (jobField.is_computed || jobField.computed_config?.is_computed) {
                      const funcName = jobField.computed_config?.computed_function || jobField.computed_function;
                      return { label: jobField.label, type: 'computed', info: funcName };
                    }
                    const s = jobField.sources?.find((s: any) => s.source_type === entityCategory) || jobField.sources?.[0];
                    return s ? { ...s, label: jobField.label, type: 'db' } : null;
                  }).filter(Boolean);

                  const mergedValue = masterIds.map((mid: string | number) => {
                    const jobField = jobFields[mid];
                    if (!jobField) return 'Missing';
                    let sourceIdx = jobField.sources?.findIndex((s: any) => s.source_type === entityCategory);
                    if (sourceIdx === -1 || sourceIdx === undefined) sourceIdx = 0;
                    const v = getFieldValue(String(mid), String(targetId), sourceIdx, field.extractionMode || 'latest');
                    return Array.isArray(v) ? v.join(', ') : v;
                  }).join(' ');

                  const isValueMissing = !mergedValue || mergedValue === 'Missing' || mergedValue === '';
                  const primarySource = sources[0];

                  return (
                    <TableRow
                      key={fIdx}
                      className={cn(
                        "group border-b border-slate-200 hover:bg-blue-50 transition-colors",
                        isValueMissing && "bg-red-50/30"
                      )}
                    >
                      <TableCell className="px-2 py-2 text-center text-xs font-mono text-slate-400 border-r border-slate-100 bg-slate-50">
                        {fIdx + 1}
                      </TableCell>

                      <TableCell className="px-4 py-2 border-r border-slate-100">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-slate-900">
                            {field.efnsDisplayName || field.variableName}
                          </span>
                          {isValueMissing && (
                            <AlertCircle className="h-3.5 w-3.5 text-red-500" />
                          )}
                        </div>
                      </TableCell>

                      <TableCell className="px-4 py-2">
                        {field.customFieldSource ? (
                          <div className="mb-1 font-medium flex items-center gap-1">
                            {field.customFieldSource}
                          </div>
                        ) : (
                          <div className="mb-1 text-xs text-red-600 font-medium">Missing</div>
                        )}
                      </TableCell>

                      <TableCell className="px-4 py-2 border-r border-slate-100">
                        {isEditing ? (
                          <div className="flex items-center gap-2">
                            {isDropdown ? (
                              <Select value={editValue} onValueChange={setEditValue}>
                                <SelectTrigger className="h-8 text-sm border-blue-400 focus:ring-1 focus:ring-blue-500">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {dropdownOptions.length > 0 ? (
                                    dropdownOptions.map(opt => (
                                      <SelectItem key={opt.value} value={opt.value} className="text-sm">
                                        {opt.label}
                                      </SelectItem>
                                    ))
                                  ) : (
                                    <div className="p-2 text-xs text-slate-400 italic text-center">
                                      No options (Check parent field)
                                    </div>
                                  )}
                                </SelectContent>
                              </Select>
                            ) : (
                              <Input
                                autoFocus
                                value={editValue}
                                onChange={e => setEditValue(e.target.value)}
                                onKeyDown={e => {
                                  if (e.key === 'Enter') saveEdit(isDropdown, dropdownOptions);
                                  if (e.key === 'Escape') cancelEditing();
                                }}
                                className="h-8 text-sm border-blue-400 focus-visible:ring-1 focus-visible:ring-blue-500"
                              />
                            )}
                            <Button
                              size="icon"
                              onClick={() => saveEdit(isDropdown, dropdownOptions)}
                              className="h-8 w-8 bg-green-600 hover:bg-green-700"
                            >
                              <Check className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={cancelEditing}
                              className="h-8 w-8 hover:bg-red-50 hover:text-red-600"
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        ) : (
                          <div
                            className={cn(
                              "text-sm py-1 px-2 rounded cursor-pointer transition-colors",
                              isValueMissing
                                ? "text-red-600 font-medium"
                                : "text-slate-900 hover:bg-blue-100"
                            )}
                            onClick={() => {
                              if (!isMissingEntity && sources[0] && sourcesDisplay.every(s => s.type !== 'computed')) {
                                startEditing(field.variableName, 0, sources[0]?.table, sources[0]?.path, mergedValue, String(targetId), sources[0]?.linking_variable);
                              }
                            }}
                          >
                            {isValueMissing ? (
                              <span className="italic">Missing</span>
                            ) : (
                              isDropdown && dropdownOptions.length > 0
                                ? (dropdownOptions.find(o => o.value === mergedValue)?.label || mergedValue)
                                : mergedValue
                            )}
                            {mergedValue === 'Computing...' && (
                              <Loader2 className="h-3 w-3 animate-spin inline ml-2" />
                            )}
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