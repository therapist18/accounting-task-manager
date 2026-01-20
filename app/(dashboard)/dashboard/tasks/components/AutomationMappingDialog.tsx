// @ts-nocheck
"use client"

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Loader2, Zap, User, Database, FileText, Eye,
  Settings, Link, Webhook, ChevronRight, AlertCircle,
  CheckCircle2, Info, ArrowRight, Edit3, X, Save, Calculator,
  FunctionSquare, ExternalLink, Layers, Copy
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from '@/hooks/use-toast';
import supabase from '@/lib/supabase/client';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { processComputedFields, executeComputedField } from '../utils/automationComputedFunctions';

// ... (Previous Interfaces remain the same) ...

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

interface AutomationDetails {
  id: string;
  name: string;
  description: string;
  webhook_url: string;
  webhook_type: string;
  webhook_method: string;
  login?: {
    url?: string;
    email?: string;
    idNumber?: string;
    password?: string;
  };
  parameters?: any;
  is_active: boolean;
}

interface EntityAutomationMapping {
  entityKey: string;
  entityName: string;
  entityType: string;
  automationId: string;
  documentId?: string;
  automation?: AutomationDetails;
}

// --- UTILS ---
const parseJsonValue = (data: any, path: string): any => {
  if (!data || !path) return undefined;
  if (path.includes('->>') || path.includes('->')) {
    const parts = path.split(/(->>|->)/);
    const column = parts[0].trim().replace(/['"]/g, '');
    const jsonPath = parts[2].trim().replace(/['"]/g, '');
    const jsonData = data[column];
    if (!jsonData || typeof jsonData !== 'object') return undefined;
    return jsonPath.split('.').reduce((acc, key) => (acc && typeof acc === 'object' ? acc[key] : undefined), jsonData);
  }
  return path.split('.').reduce((acc, key) => (acc && typeof acc === 'object' ? acc[key] : undefined), data);
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

  // Default ISO
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
  const [masterFieldComputedValues, setMasterFieldComputedValues] = useState<Record<string, string | string[]>>({});

  // --- HELPERS ---
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

  // --- FETCH SOURCE DATA ---
  const fetchSourceData = useCallback(async () => {
    if (Object.keys(jobFields).length === 0 || !webData.length || !selectedAutomationId) return;

    setIsLoadingData(true);

    try {
      const fetchQueue = new Map<string, Set<string>>();
      const activeAutomation = webData.find(w => w.automationId === selectedAutomationId);
      const fieldsToProcess = activeAutomation?.fields || [];
      const computedMasterFields: any[] = [];

      fieldsToProcess.forEach((field: any) => {
        if (field.fieldType === 'array') {
          // --- Array Items Logic ---
          const entityIds = resolveEntityIdsForArray(field, relationshipData);
          (field.arrayItems || []).forEach((col: any) => {
            if (col.linkedMasterFieldId) {
              const jobField = jobFields[col.linkedMasterFieldId];

              if (jobField) {
                if (jobField.is_computed || jobField.computed_config?.is_computed) {
                  // Pass the extraction mode defined on the ARRAY COLUMN
                  const extractionMode = col.extractionMode || 'latest';
                  entityIds.forEach((id: any) => {
                    computedMasterFields.push({
                      field: jobField,
                      entityId: String(id),
                      extractionMode: extractionMode
                    });
                  });
                } else {
                  // Standard DB Fetch for Array Items
                  jobField.sources?.forEach((source: any) => {
                    if (source.table) {
                      if (!fetchQueue.has(source.table)) fetchQueue.set(source.table, new Set());
                      entityIds.forEach(id => fetchQueue.get(source.table)!.add(String(id)));
                    }
                  });
                }
              }
            }
          });
        } else {
          // --- Standard High-Level Field Logic ---
          const targetId = resolveTargetEntityId(field);
          if (targetId) {
            (field.masterFieldIds || []).forEach((mid: string) => {
              const jobField = jobFields[mid];
              if (jobField) {
                if (jobField.is_computed || jobField.computed_config?.is_computed) {
                  // Pass the extraction mode defined on the STANDARD FIELD
                  const extractionMode = field.extractionMode || 'latest';
                  computedMasterFields.push({
                    field: jobField,
                    entityId: targetId,
                    extractionMode: extractionMode
                  });
                } else {
                  // Standard DB Fetch
                  jobField.sources?.forEach((source: any) => {
                    if (source.table) {
                      if (!fetchQueue.has(source.table)) fetchQueue.set(source.table, new Set());
                      fetchQueue.get(source.table)!.add(String(targetId));
                    }
                  });
                }
              }
            });
          }
        }
      });

      // 2. Process Standard DB Fetches
      const newSourceData: Record<string, Record<string, any>> = {};
      for (const [table, ids] of fetchQueue.entries()) {
        const idArray = Array.from(ids);
        if (idArray.length === 0) continue;
        const queryField = table === 'acc_portal_directors_documents' ? 'director_id' : table === 'tm_tasks' ? 'id' : 'id';
        const { data, error } = await supabase.from(table).select('*').in(queryField, idArray);
        if (!error) {
          if (!newSourceData[table]) newSourceData[table] = {};
          data?.forEach(record => {
            const recordKey = String(record[queryField]);
            newSourceData[table][recordKey] = record;
          });
        }
      }
      setSourceData(newSourceData);

      // 3. Process Computed Fields
      if (computedMasterFields.length > 0) {
        const newComputedValues: Record<string, string | string[]> = {};
        await Promise.all(computedMasterFields.map(async (item) => {
          const { field, entityId, extractionMode } = item;
          const config = field.computed_config || {};
          const docs = config.document_ids || [];
          const source = field.sources?.[0];
          let val: string | string[];

          if (source && source.path && source.source_type === 'document') {
            console.log(`[Computed] ID: ${entityId}, Mode: ${extractionMode}, Path: ${source.path}`);
            val = await executeComputedField(
              'extractFieldFromLatestDocument',
              entityId,
              docs,
              source.path,
              extractionMode // 'latest' or 'all'
            );
          } else if (config.computed_function) {
            val = await executeComputedField(config.computed_function, entityId, docs, undefined, extractionMode);
          } else {
            val = "No Config";
          }

          // !!! FIX: INCLUDE MODE IN KEY TO AVOID COLLISION !!!
          newComputedValues[`${field.id}_${entityId}_${extractionMode}`] = val;
        }));
        setMasterFieldComputedValues(newComputedValues);
      }
    } catch (error) {
      console.error("Fetch Error:", error);
    } finally {
      setIsLoadingData(false);
    }
  }, [jobFields, selectedAutomationId, webData, resolveTargetEntityId, relationshipData]);

  const getSourceValue = (table: string, path: string, entityId: string) => {
    const tableData = sourceData[table];
    if (!tableData) return "Missing";

    const record = tableData[entityId];
    if (!record) return "Missing";

    const val = parseJsonValue(record, path);
    return val !== undefined && val !== null ? String(val) : "Missing";
  };

  const getFieldValue = (fieldId: string, entityId: string, sourceIdx: number = 0, extractionMode: string = 'latest') => {
    const field = jobFields[fieldId];
    if (!field) return "Missing Config";

    // Computed
    if (field.is_computed || field.computed_config?.is_computed) {
      // !!! FIX: INCLUDE MODE IN LOOKUP KEY !!!
      const key = `${field.id}_${entityId}_${extractionMode}`;
      const val = masterFieldComputedValues[key];
      if (val === undefined) return "Computing...";
      return val;
    }
    // Standard Source
    const source = field.sources?.[sourceIdx];
    if (!source) return "No Source";
    return getSourceValue(source.table, source.path, String(entityId));
  };

  // --- DOCUMENT FETCHER ---
  const fetchDocumentFiles = useCallback(async () => {
    if (!selectedAutomationId || !webData.length) return;
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
  }, [selectedAutomationId, webData, resolveTargetEntityId]);

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

        // --- UPDATED FIELD ID EXTRACTION LOGIC ---
        const fieldIds = finalWebDataItems.flatMap(i => {
          const fields = i.fields || [];
          // 1. Get IDs from top-level standard fields
          const directIds = fields.flatMap((f: any) => f.masterFieldIds || []);
          // 2. Get IDs from nested array items
          const arrayIds = fields.flatMap((f: any) =>
            (f.arrayItems || []).map((item: any) => item.linkedMasterFieldId)
          );
          return [...directIds, ...arrayIds];
        }).filter(Boolean); // Remove nulls/undefined/0

        // De-duplicate IDs before fetching
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
    if (isOpen && selectedAutomationId) { fetchSourceData(); fetchDocumentFiles(); }
  }, [selectedAutomationId, isOpen, jobFields, resolveTargetEntityId, fetchSourceData, fetchDocumentFiles]);

  // --- AUTO COMPUTATION EFFECT ---
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
      } catch (error) { console.error('Error auto-computing fields:', error); } finally { setIsComputing(false); }
    };
    const timer = setTimeout(runComputation, 500);
    return () => clearTimeout(timer);
  }, [currentIndividualId, selectedAutomationId, webData]);

  // --- PAYLOAD GENERATION ---
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
        // 1. Documents
        if (f.fieldType === 'document') {
          const targetId = resolveTargetEntityId(f);
          const doc = documentFiles.find(d => d.document_id === f.kycDocumentId && String(d.owner_id) === String(targetId));
          if (doc) formData[f.variableName] = buildFileUrl(doc);
          return;
        }

        if (f.fieldType === 'computed') return;

        // 2. Arrays with Expansion Logic (extractionMode: 'all')
        if (f.fieldType === 'array') {
          const entityIds = resolveEntityIdsForArray(f, relationshipData);
          const finalArrayData: any[] = [];

          entityIds.forEach((id: string) => {
            // First, fetch values for all columns for this entity
            const columnsData = (f.arrayItems || []).map((col: any) => {
              let val: any = '';
              if (col.linkedMasterFieldId) {
                const field = jobFields[col.linkedMasterFieldId];
                if (field?.is_computed || field?.computed_config?.is_computed) {
                  // !!! FIX: USE COL-SPECIFIC MODE FOR KEY !!!
                  const key = `${field.id}_${id}_${col.extractionMode || 'latest'}`;
                  val = masterFieldComputedValues[key];
                } else if (field?.sources?.[0]) {
                  val = getSourceValue(field.sources[0].table, field.sources[0].path, String(id));
                  if (val === 'Missing') val = '';
                }
              }
              return { ...col, value: val };
            });

            // Determine maximum rows needed for this entity based on 'all' mode columns
            const maxRows = Math.max(
              1,
              ...columnsData.map((c: any) => Array.isArray(c.value) ? c.value.length : 1)
            );

            // Generate rows for this entity
            for (let i = 0; i < maxRows; i++) {
              const rowObj: Record<string, any> = {};
              columnsData.forEach((col: any) => {
                let v = col.value;
                if (Array.isArray(v)) {
                  // It's an array (from 'all' mode). Pick index i.
                  v = v[i] !== undefined ? v[i] : "";
                } else {
                  // It's a single value. Repeat it for all expanded rows
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

        // 3. Standard Fields
        const targetId = resolveTargetEntityId(f);
        const values = (f.masterFieldIds || []).map((mid: string) => {
          // !!! FIX: PASS FIELD-SPECIFIC MODE !!!
          let val = getFieldValue(mid, String(targetId), 0, f.extractionMode || 'latest');

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

      console.log("🚀 Payload:", payload);
      const res = await fetch(automation.webhook_url, { method: automation.webhook_method || 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!res.ok) throw new Error("Trigger failed: " + res.status);
      toast({ title: 'Success', description: 'Automation process initiated successfully' });
    } catch (e) {
      console.error("Automation Error:", e);
      toast({ title: 'Automation Error', description: e.message, variant: 'destructive' });
    } finally { setIsAutomationRunning(false); }
  };

  const startEditing = (fieldId: string, sourceIdx: number, table: string, path: string, val: string, entityId: string) => {
    setEditingCell({ fieldId, sourceIdx, table, path, entityId });
    setEditValue(val === 'Missing' ? '' : val);
  };

  const saveEdit = async () => {
    if (!editingCell) return;
    const { table, path, entityId } = editingCell;
    setIsLoadingData(true);
    try {
      const queryField = table === 'acc_portal_directors_documents' ? 'director_id' : 'id';
      const { data: existing } = await supabase.from(table).select('*').eq(queryField, entityId).maybeSingle();
      const updated = updateJsonValue(existing || {}, path, editValue);
      const { error } = await supabase.from(table).upsert({ [queryField]: entityId, ...updated, updated_at: new Date().toISOString() });
      if (error) throw error;
      toast({ title: 'Success', description: 'Field updated' });
      await fetchSourceData();
    } catch (e) { toast({ title: 'Error', description: 'Update failed', variant: 'destructive' }); } finally { setIsLoadingData(false); setEditingCell(null); }
  };

  const selectedMapping = useMemo(() => entityAutomationMappings.find(m => m.automationId === selectedAutomationId), [selectedAutomationId, entityAutomationMappings]);
  const activeWebEntry = useMemo(() => webData.find(e => e.automationId === selectedAutomationId), [selectedAutomationId, webData]);

  const renderFieldsTable = () => {
    if (!activeWebEntry?.fields || activeWebEntry.fields.length === 0) return <div className="p-12 text-center text-slate-400">No fields configured.</div>;
    const regularFields = activeWebEntry.fields.filter((f: any) => f.fieldType !== 'document' && f.fieldType !== 'computed');
    const computedFields = activeWebEntry.fields.filter((f: any) => f.fieldType === 'computed');

    return (
      <div className="flex flex-col h-full space-y-8">
        <div className="flex-1 border border-slate-300 shadow-md bg-white flex flex-col overflow-hidden rounded-md">
          <ScrollArea className="flex-1 w-full h-full">
            <Table className="w-full border-collapse">
              <TableHeader className="bg-blue-600 sticky top-0 z-20 shadow-sm">
                <TableRow className="hover:bg-blue-600 border-b-0">
                  <TableHead className="w-[40px] text-blue-100 text-xs border-r border-blue-500 text-center h-9">#</TableHead>
                  <TableHead className="w-[300px] text-white font-semibold border-r border-blue-500 h-9">Automation Variable</TableHead>
                  <TableHead className="w-[400px] text-white font-semibold border-r border-blue-500 h-9">Field Source</TableHead>
                  <TableHead className="text-white font-semibold h-9">Value (Click to Edit)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {regularFields.map((field, fIdx) => {
                  if (field.fieldType === 'array') {
                    const entityIds = resolveEntityIdsForArray(field, relationshipData);
                    return (
                      <TableRow key={fIdx} className="bg-slate-50/50 hover:bg-slate-50 border-b border-slate-300">
                        <TableCell className="text-center text-xs text-slate-400 bg-slate-50 border-r border-b border-slate-300">{fIdx + 1}</TableCell>
                        <TableCell className="border-r border-b border-slate-300 px-2 py-2 align-top">
                          <div className="text-sm font-bold text-slate-800">{field.efnsDisplayName || field.variableName}</div>
                          <Badge variant="secondary" className="mt-1 text-[10px] bg-blue-100 text-blue-700">
                            Array (Mapped from {entityIds.length} entities)
                          </Badge>
                        </TableCell>
                        <TableCell colSpan={2} className="p-0 border-b border-slate-300">
                          <div className="border rounded m-2 bg-white overflow-hidden shadow-sm">
                            <Table>
                              <TableHeader className="bg-slate-100">
                                <TableRow>
                                  <TableHead className="h-7 text-[10px] font-bold uppercase w-[40px]">#</TableHead>
                                  {(field.arrayItems || []).map((col: any, i: number) => (
                                    <TableHead key={i} className="h-7 text-[10px] font-bold uppercase">
                                      <div className="flex items-center gap-1">
                                        {col.name}
                                        {col.extractionMode === 'all' && <Badge variant="outline" className="text-[9px] h-3 px-1 py-0 border-purple-200 text-purple-600 bg-purple-50">ALL</Badge>}
                                        <span className="text-slate-400 font-normal normal-case">({col.type})</span>
                                      </div>
                                    </TableHead>
                                  ))}
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {entityIds.length === 0 ? (
                                  <TableRow><TableCell colSpan={10} className="text-center text-xs py-2 italic text-slate-400">No entities found.</TableCell></TableRow>
                                ) : (
                                  entityIds.map((id: string, entityIdx: number) => {
                                    // 1. Gather data for this entity
                                    const columnsData = (field.arrayItems || []).map((col: any) => {
                                      let val: any = 'Manual/Unmapped';
                                      if (col.linkedMasterFieldId) {
                                        const mField = jobFields[col.linkedMasterFieldId];
                                        if (mField?.is_computed || mField?.computed_config?.is_computed) {
                                          // !!! FIX: USE COL-SPECIFIC MODE FOR KEY !!!
                                          const key = `${mField.id}_${id}_${col.extractionMode || 'latest'}`;
                                          val = masterFieldComputedValues[key];
                                        } else if (mField?.sources?.[0]) {
                                          val = getSourceValue(mField.sources[0].table, mField.sources[0].path, String(id));
                                        }
                                      }
                                      return { ...col, value: val };
                                    });

                                    // 2. Calculate expansion (rows needed) for this entity
                                    const maxSubRows = Math.max(1, ...columnsData.map((c: any) => Array.isArray(c.value) ? c.value.length : 1));

                                    // 3. Render sub-rows
                                    return Array.from({ length: maxSubRows }).map((_, subRowIdx) => (
                                      <TableRow key={`${entityIdx}-${subRowIdx}`} className="h-8 hover:bg-slate-50 border-b border-slate-100 last:border-0">
                                        <TableCell className="text-xs text-slate-400 text-center font-mono">
                                          {entityIdx + 1}.{subRowIdx + 1}
                                        </TableCell>
                                        {columnsData.map((col: any, cIdx: number) => {
                                          let displayVal = col.value;

                                          if (Array.isArray(displayVal)) {
                                            // Array item: pick index or show blank if out of bounds
                                            displayVal = displayVal[subRowIdx] !== undefined ? displayVal[subRowIdx] : '';
                                          } else {
                                            // Single value: Repeat it
                                            displayVal = displayVal || '';
                                            if (displayVal === 'Computing...') displayVal = <span className="text-purple-400 italic text-[10px]">Computing...</span>;
                                          }

                                          return (
                                            <TableCell key={cIdx} className="text-xs max-w-[150px] truncate border-r border-slate-50 last:border-0" title={typeof displayVal === 'string' ? displayVal : ''}>
                                              {displayVal}
                                            </TableCell>
                                          );
                                        })}
                                      </TableRow>
                                    ));
                                  })
                                )}
                              </TableBody>
                            </Table>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  }

                  const targetId = resolveTargetEntityId(field);
                  const isMissingEntity = !targetId;
                  const masterIds = field.masterFieldIds || [];
                  const sources = masterIds.map(mid => {
                    const f = jobFields[mid];
                    return f?.sources?.[0] ? { ...f.sources[0], label: f.label } : null;
                  }).filter(Boolean);

                  const sourcesDisplay = masterIds.map(mid => {
                    const jobField = jobFields[mid];
                    if (!jobField) return null;
                    if (jobField.is_computed || jobField.computed_config?.is_computed) {
                      const funcName = jobField.computed_config?.computed_function || jobField.computed_function;
                      return { label: jobField.label, type: 'computed', info: `Logic: ${funcName}`, mode: field.extractionMode };
                    }
                    const s = jobField.sources?.[0];
                    return s ? { ...s, label: jobField.label, type: 'db' } : null;
                  }).filter(Boolean);

                  const mergedValue = masterIds.map(mid => {
                    // !!! FIX: PASS FIELD-SPECIFIC MODE !!!
                    const v = getFieldValue(mid, String(targetId), 0, field.extractionMode || 'latest');
                    return Array.isArray(v) ? v.join(', ') : v;
                  }).join(' ');

                  const isEditing = editingCell?.fieldId === field.variableName;
                  let entityDisplay = "Principal";
                  if (field.entityType === 'company') entityDisplay = "Company";
                  else if (field.entityType === 'dependant') entityDisplay = `Dependant (${field.dependantRelationship || 'First'})`;

                  if (sourcesDisplay.length === 0 && sources.length === 0) {
                    return (
                      <TableRow key={fIdx} className="h-9 hover:bg-slate-50">
                        <TableCell className="text-center text-xs text-slate-400 bg-slate-50 border-r border-slate-200 border-b">{fIdx + 1}</TableCell>
                        <TableCell className="border-r border-b border-slate-200 px-2 py-1 text-sm font-medium text-slate-700 bg-slate-50/30">{field.efnsDisplayName || field.name}</TableCell>
                        <TableCell className="border-r border-b border-slate-200 px-2 py-1 text-xs text-slate-500">{entityDisplay}</TableCell>
                        <TableCell className="border-r border-b border-slate-200 px-2 py-1 text-xs text-slate-400 italic" colSpan={1}>No database mapping configured</TableCell>
                        <TableCell className="border-b border-slate-200 px-2 py-1 text-xs text-slate-400">-</TableCell>
                      </TableRow>
                    );
                  }

                  return (
                    <TableRow key={fIdx} className="h-9 group hover:bg-slate-50 transition-colors">
                      <TableCell className="text-center text-xs text-slate-400 bg-slate-50 border-r border-b border-slate-300">{fIdx + 1}</TableCell>
                      <TableCell className="border-r border-b border-slate-300 px-2 py-0 align-middle">
                        <div className="text-sm font-semibold text-slate-800 truncate" title={field.variableName}>
                          {field.efnsDisplayName || field.variableName}
                        </div>
                      </TableCell>
                      <TableCell className="border-r border-b border-slate-300 px-2 py-0 align-middle bg-slate-50/20">
                        <div className="flex flex-col gap-1">
                          {field.customFieldSource ? (
                            <div className="text-xs text-slate-600 truncate" title={field.customFieldSource}>{field.customFieldSource}</div>
                          ) : (
                            sourcesDisplay.map((source, idx) => (
                              <div key={idx} className="flex items-center gap-1.5 overflow-hidden">
                                {source.type === 'computed' ? (
                                  <>
                                    <FunctionSquare className="h-3 w-3 text-purple-500 flex-shrink-0" />
                                    <span className="text-xs text-purple-700 truncate font-medium" title={source.info}>{source.label}</span>
                                    {source.mode === 'all' && <Badge variant="outline" className="text-[9px] h-3.5 px-1 py-0 border-purple-300 text-purple-700">ALL</Badge>}
                                  </>
                                ) : (
                                  <>
                                    <Database className="h-3 w-3 text-slate-400 flex-shrink-0" />
                                    <span className="text-xs text-slate-600 truncate" title={`${source.table}.${source.path}`}>{source.label}</span>
                                  </>
                                )}
                              </div>
                            ))
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="border-b border-slate-300 p-0 relative h-9 align-middle">
                        {isEditing ? (
                          <div className="w-full h-full flex">
                            <Input autoFocus value={editValue} onChange={e => setEditValue(e.target.value)} onKeyDown={e => e.key === 'Enter' && saveEdit()} onBlur={saveEdit} className="w-full h-full rounded-none border-none focus-visible:ring-0 px-2 text-sm bg-blue-50 text-slate-900" />
                          </div>
                        ) : (
                          <div onClick={() => !isMissingEntity && sources[0] && startEditing(field.variableName, 0, sources[0]?.table, sources[0]?.path, mergedValue, String(targetId))} className={cn("w-full h-full px-2 flex items-center select-none text-sm", sourcesDisplay.some(s => s.type === 'computed') ? "cursor-default" : "cursor-text hover:bg-blue-50 transition-colors", mergedValue === '' ? "text-red-500 italic bg-red-50/30" : "text-slate-800", isMissingEntity && "opacity-50 cursor-not-allowed")}>
                            <span className="truncate" title={mergedValue}>{mergedValue || 'Missing'}</span>
                            {mergedValue === '' && (
                              <>
                                <Badge variant="destructive" className="ml-2 text-[9px] h-4 px-1.5 py-0 bg-red-100 text-red-700 border-red-200">No Data</Badge>
                                <AlertCircle className="h-3 w-3 ml-1 text-red-400 opacity-50" />
                              </>
                            )}
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {/* ... Computed Fields Render ... */}
                {computedFields.length > 0 && regularFields.length > 0 && (
                  <TableRow className="bg-slate-100 border-b-2 border-slate-300"><TableCell colSpan={5} className="py-2 px-4"><div className="flex items-center gap-2 text-slate-500 font-bold text-xs uppercase tracking-widest"><Calculator className="h-4 w-4" /> Computed Automatically</div></TableCell></TableRow>
                )}
                {computedFields.map((field, fIdx) => (
                  <TableRow key={`computed-${fIdx}`} className="h-9 hover:bg-purple-50/30 transition-colors">
                    <TableCell className="text-center text-xs text-purple-400 bg-purple-50/30 border-r border-b border-slate-300">{regularFields.length + fIdx + 1}</TableCell>
                    <TableCell className="border-r border-b border-slate-300 px-2 py-0 align-middle"><div className="text-sm font-semibold text-slate-800 truncate" title={field.variableName}>{field.efnsDisplayName || field.variableName}</div></TableCell>
                    <TableCell className="border-r border-b border-slate-300 px-2 py-0 align-middle bg-purple-50/10"><div className="flex flex-col gap-1"><div className="flex items-center gap-1.5 overflow-hidden"><FunctionSquare className="h-3 w-3 text-purple-400 flex-shrink-0" /><span className="text-xs text-purple-700 truncate" title={field.computedFunction}>{field.computedFunction}</span></div></div></TableCell>
                    <TableCell className="border-b border-slate-300 px-2 py-0 align-middle bg-slate-50/50">{isComputing ? <div className="flex items-center gap-2 text-xs text-slate-400"><Loader2 className="h-3 w-3 animate-spin" /> Calculating...</div> : computedFieldsPreview[field.variableName] ? <span className="text-sm font-bold text-green-700 truncate block" title={computedFieldsPreview[field.variableName]}>{computedFieldsPreview[field.variableName]}</span> : <span className="text-xs text-slate-400 italic">Pending...</span>}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        </div>
      </div>
    );
  };

    const renderDocumentsSection = () => {
    // 1. Filter automation fields for 'document' type
    const docFields = activeWebEntry?.fields?.filter((f: any) => f.fieldType === 'document') || [];

    // 2. Add legacy kycDocsUpload if any (for backward compatibility)
    const legacyDocs = activeWebEntry?.kycDocsUpload || [];
    // Convert legacy to match field structure roughly
    const allDocs = [
      ...docFields,
      ...legacyDocs.map((d: any) => ({
        id: d.id,
        variableName: d.kycDocumentId,
        efnsDisplayName: d.documentName || "Legacy Document",
        kycDocumentId: d.kycDocumentId,
        entityTypes: ['principal'] // Default for legacy
      }))
    ];

    if (allDocs.length === 0) return <div className="p-12 text-center text-slate-400">No document assets configured.</div>;

    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {allDocs.map((req, idx) => {
          // Resolve which entity this document belongs to
          const targetId = resolveTargetEntityId(req);

          // Find the file in our fetched list
          const foundDoc = documentFiles.find(d =>
            d.document_id === req.kycDocumentId &&
            String(d.owner_id) === String(targetId)
          );

          // Determine label for the entity (e.g. "Principal", "Company")
          let entityLabel = "Principal";
          if (req.entityTypes?.includes('company')) entityLabel = "Company";
          else if (req.entityTypes?.includes('dependant')) entityLabel = "Dependant";

          return (
            <Card key={idx} className={cn("overflow-hidden border-2 transition-all", foundDoc ? "border-green-100 shadow-sm" : "border-amber-100 shadow-none bg-amber-50/20")}>
              <CardContent className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className={cn("p-3 rounded-xl", foundDoc ? "bg-green-100 text-green-600" : "bg-amber-100 text-amber-600")}>
                    <FileText className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-bold text-slate-900 leading-tight">{req.efnsDisplayName || 'Document'}</h4>
                      <Badge variant="secondary" className="text-[9px] h-4 px-1.5">{entityLabel}</Badge>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-1">KYC ID: {req.kycDocumentId}</p>
                    {req.variableName && <p className="text-[10px] text-blue-400 font-mono">var: {req.variableName}</p>}
                  </div>
                </div>
                {foundDoc ? (
                  <div className="flex flex-col items-end gap-2">
                    <Badge className="bg-green-500 hover:bg-green-600 gap-1.5 py-1 px-3">
                      <CheckCircle2 className="h-3 w-3" /> Ready
                    </Badge>
                    <a
                      href={buildFileUrl(foundDoc)}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[10px] text-blue-600 flex items-center gap-1 hover:underline"
                    >
                      Preview <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                ) : (
                  <Badge variant="outline" className="text-amber-600 border-amber-200 bg-white gap-1.5 py-1 px-3">
                    <AlertCircle className="h-3 w-3" /> Missing
                  </Badge>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    );
  };
  

   return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-[95vw] w-[1400px] h-[90vh] flex flex-col p-0 overflow-hidden border-none shadow-2xl">
        <div className="p-5 border-b bg-white flex items-center justify-between shadow-sm z-20">
          <div className="flex items-center gap-5">
            <div className="h-12 w-12 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-blue-200"><Zap className="h-6 w-6 fill-white" /></div>
            <div>
              <DialogTitle className="text-2xl font-black text-slate-900 tracking-tight">Automation Lab</DialogTitle>
              <div className="flex items-center gap-2 text-slate-500 font-medium text-sm mt-0.5"><span>Task #{task?.id}</span><ChevronRight className="h-4 w-4 text-slate-300" /><span className="text-slate-900">{task?.applicant_name}</span></div>
            </div>
          </div>
          <div className="px-3 space-y-2 pb-5">
            {entityAutomationMappings.map((mapping) => (
              <button key={mapping.automationId} onClick={() => setSelectedAutomationId(mapping.automationId)} className={cn("w-full text-left p-4 rounded-2xl border-2 transition-all group relative", selectedAutomationId === mapping.automationId ? "bg-blue-50/50 border-blue-600 shadow-sm" : "hover:bg-slate-50 border-transparent")}>
                <div className="flex items-center gap-4"><div className={cn("h-10 w-10 rounded-xl flex items-center justify-center transition-all", selectedAutomationId === mapping.automationId ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-400 group-hover:bg-slate-200")}><Webhook className="h-5 w-5" /></div><div className="flex-1 min-w-0"><p className={cn("text-sm font-bold truncate", selectedAutomationId === mapping.automationId ? "text-blue-900" : "text-slate-700")}>{mapping.automation?.name || "Unnamed Flow"}</p></div></div>
                {selectedAutomationId === mapping.automationId && <div className="absolute right-4 top-1/2 -translate-y-1/2"><div className="h-2 w-2 rounded-full bg-blue-600 animate-pulse" /></div>}
              </button>
            ))}
            {entityAutomationMappings.length === 0 && <div className="p-10 text-center space-y-3"><Settings className="h-10 w-10 text-slate-200 mx-auto" /><p className="text-xs text-slate-400 font-medium">No automations configured for this class level.</p></div>}
          </div>
          <div className="flex items-center gap-3 bg-slate-50 p-1.5 rounded-2xl border border-slate-200">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-white rounded-xl border border-slate-200 shadow-sm"><User className="h-4 w-4 text-blue-500" /><input value={currentIndividualId} onChange={(e) => setCurrentIndividualId(e.target.value)} placeholder="ID Number..." className="w-32 outline-none text-sm font-bold text-slate-700" /></div>
            {isLoading && <Loader2 className="h-5 w-5 animate-spin text-blue-600 mx-2" />}
          </div>
        </div>

        <div className="flex-1 flex overflow-hidden bg-slate-50/50">
          <div className="flex-1 flex flex-col overflow-hidden">
            {!selectedAutomationId ? (
              <div className="flex-1 flex flex-col items-center justify-center text-slate-300"><Webhook className="h-16 w-16 mb-4 opacity-10" /><p className="text-lg font-medium">Select a workflow from the sidebar</p></div>
            ) : (
              <>
                <div className="px-8 py-4 bg-white border-b flex items-center justify-between flex-shrink-0">
                  <Tabs value={activeTab} onValueChange={setActiveTab} className="w-fit">
                    <TabsList className="bg-slate-100/80 p-1 h-11 rounded-xl">
                      <TabsTrigger value="fields" className="rounded-lg px-6 data-[state=active]:shadow-sm"><Database className="h-4 w-4 mr-2" /> Data Map</TabsTrigger>
                      <TabsTrigger value="documents" className="rounded-lg px-6 data-[state=active]:shadow-sm"><FileText className="h-4 w-4 mr-2" /> Assets</TabsTrigger>
                    </TabsList>
                  </Tabs>
                  <div className="flex items-center gap-4">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild><div className="flex flex-col items-end"><span className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">Status</span><div className="flex items-center gap-1.5 text-green-600 font-bold text-sm"><CheckCircle2 className="h-4 w-4" /> Endpoint Active</div></div></TooltipTrigger>
                        <TooltipContent className="bg-slate-900 text-white border-none p-3"><p className="text-xs">{selectedMapping?.automation?.webhook_url}</p></TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                </div>

                <div className="flex-1 overflow-hidden relative">
                  <Tabs value={activeTab} className="h-full w-full">
                    <TabsContent value="fields" className="h-full m-0 p-8 flex flex-col overflow-hidden data-[state=active]:flex">
                      <div className="mb-4 flex items-center justify-between flex-shrink-0">
                        <div><h2 className="text-xl font-bold text-slate-900">Field Correspondence</h2><p className="text-sm text-slate-500">Mapping master database fields to the target automation schema.</p></div>
                        <Badge variant="outline" className="px-4 py-1 text-blue-600 border-blue-100 bg-blue-50/50">{activeWebEntry?.fields?.filter((f: any) => f.fieldType !== 'document').length || 0} Total Fields</Badge>
                      </div>
                      <div className="flex-1 overflow-hidden">{renderFieldsTable()}</div>
                    </TabsContent>
                    <TabsContent value="documents" className="h-full m-0 p-8 overflow-auto"><div className="mb-6"><h2 className="text-xl font-bold text-slate-900">Required Assets</h2><p className="text-sm text-slate-500">Documents that will be sent as part of the automation payload.</p></div>{renderDocumentsSection()}</TabsContent>
                  </Tabs>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="p-6 border-t bg-white flex justify-between items-center z-20 shadow-[0_-4px_20px_-10px_rgba(0,0,0,0.1)]">
          <Button variant="ghost" className="font-bold text-slate-500 hover:bg-slate-50" onClick={onClose}>Discard Changes</Button>
          <div className="flex items-center justify-between">
            <Button onClick={handleRunAutomation} disabled={isAutomationRunning} className="bg-blue-600 hover:bg-blue-700 text-white h-12 px-10 rounded-xl font-bold shadow-lg shadow-blue-200 flex items-center gap-3 transition-all hover:scale-[1.02] active:scale-[0.98]">
              {isAutomationRunning ? <Loader2 className="h-5 w-5 animate-spin" /> : <Zap className="h-5 w-5 fill-white" />}<span>{isAutomationRunning ? 'Executing...' : 'Execute Workflow'}</span>
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};