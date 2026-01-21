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
  ArrowUpDown, Filter
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

// ... (Keep existing interfaces) ...

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
    if (!jsonData || typeof jsonData === 'object') return undefined;
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
  
  // Editing State
  const [editingCell, setEditingCell] = useState<any>(null);
  const [editValue, setEditValue] = useState('');
  
  const [activeTab, setActiveTab] = useState('fields');
  const [currentIndividualId, setCurrentIndividualId] = useState(individualId || task?.individual_id?.toString() || '');
  const [computedFieldsPreview, setComputedFieldsPreview] = useState<Record<string, string>>({});
  const [isComputing, setIsComputing] = useState(false);
  const [sourceData, setSourceData] = useState<Record<string, Record<string, any>>>({});
  const [masterFieldComputedValues, setMasterFieldComputedValues] = useState<Record<string, string | string[]>>({});

  // Sorting State
  const [sortMissingFirst, setSortMissingFirst] = useState(false);

  // Fetch tracking to prevent infinite loops
  const lastFetchKey = React.useRef<string>('');
  const isFetchingRef = React.useRef(false);

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

  const fetchSourceData = useCallback(async () => {
    // Guard: Don't fetch if not ready
    if (!isOpen || !selectedAutomationId || Object.keys(jobFields).length === 0 || !webData.length) {
      return;
    }

    // Create a unique key for this fetch configuration
    const fetchKey = `${selectedAutomationId}-${Object.keys(jobFields).length}-${webData.length}`;
    
    // Guard: Prevent duplicate fetches with the same configuration
    if (isFetchingRef.current || lastFetchKey.current === fetchKey) {
      console.log('[fetchSourceData] Skipping duplicate fetch:', fetchKey);
      return;
    }

    lastFetchKey.current = fetchKey;
    isFetchingRef.current = true;
    setIsLoadingData(true);

    try {
      // 1. Setup Queues
      const standardFetchQueue = new Map<string, Set<string>>();
      const computedRequirements = {
          individualIds: new Set<string>(),
          documentIds: new Set<string>()
      };
      
      const activeAutomation = webData.find(w => w.automationId === selectedAutomationId);
      const fieldsToProcess = activeAutomation?.fields || [];
      const computedMasterFields: any[] = [];

      // 2. Iterate Fields to build queues
      fieldsToProcess.forEach((field: any) => {
        const isArray = field.fieldType === 'array';
        const cols = isArray ? (field.arrayItems || []) : [{ linkedMasterFieldId: field.masterFieldIds?.[0] }];
        
        // Determine Entities involved
        let entityIds: string[] = [];
        if (isArray) {
            entityIds = resolveEntityIdsForArray(field, relationshipData);
        } else {
            const targetId = resolveTargetEntityId(field);
            if (targetId) entityIds = [String(targetId)];
        }

        // Check columns/fields
        cols.forEach((col: any) => {
            if(!col.linkedMasterFieldId && !field.masterFieldIds) return;
            const mid = col.linkedMasterFieldId || field.masterFieldIds?.[0];
            const jobField = jobFields[mid];
            
            if (jobField) {
                // A. COMPUTED FIELDS
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

                // B. STANDARD DB FIELDS
                } else {
                     jobField.sources?.forEach((source: any) => {
                        if (source.table) {
                            if (!standardFetchQueue.has(source.table)) standardFetchQueue.set(source.table, new Set());
                            
                            // CRITICAL FIX: Only add IDs that match the table's entity type
                            const tableEntityMap: Record<string, string[]> = {
                                'acc_portal_directors_documents': ['principal', 'director', 'dependant', 'understudy'],
                                'acc_portal_individuals': ['principal', 'director', 'dependant', 'understudy'],
                                'acc_portal_company_duplicate': ['company'],
                                'acc_portal_companies': ['company'],
                                'tm_tasks': ['task']
                            };
                            
                            const allowedEntityTypes = tableEntityMap[source.table] || [];
                            const fieldEntityTypes = field.entityTypes || [];
                            
                            // Only add entity IDs if there's overlap between field types and table types
                            const hasMatchingEntityType = allowedEntityTypes.length === 0 || 
                                fieldEntityTypes.some(type => allowedEntityTypes.includes(type));
                            
                            if (hasMatchingEntityType) {
                                entityIds.forEach(id => standardFetchQueue.get(source.table)!.add(String(id)));
                            }
                        }
                    });
                }
            }
        });
      });

      // 3. EXECUTE BATCH FETCHES (OPTIMIZED - SINGLE QUERY PER TABLE)
      const newSourceData: Record<string, Record<string, any>> = {};
      const documentCache = { documents: [], docTypes: [] };
      const fetchPromises = [];

      const fullDocsDirectorIds = standardFetchQueue.get('acc_portal_directors_documents');
      
      // A. Batch Standard Tables (ONLY ONE QUERY PER TABLE)
      for (const [table, ids] of standardFetchQueue.entries()) {
        const idArray = Array.from(ids);
        if (idArray.length === 0) continue;
        const queryField = table === 'acc_portal_directors_documents' ? 'director_id' : table === 'tm_tasks' ? 'id' : 'id';
        
        fetchPromises.push(
            supabase.from(table).select('*').in(queryField, idArray)
            .then(({ data, error }) => {
                if (!error && data) {
                    if (!newSourceData[table]) newSourceData[table] = {};
                    data.forEach(record => {
                        const recordKey = String(record[queryField]);
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

      // B. Computed Documents (Batched, only for people not already fetched)
      const neededDocTypes = Array.from(computedRequirements.documentIds);
      const allNeededPeople = Array.from(computedRequirements.individualIds);
      
      const remainingPeople = allNeededPeople.filter(pid => 
          !fullDocsDirectorIds || !fullDocsDirectorIds.has(pid)
      );

      const computedPromises = [];

      if (neededDocTypes.length > 0) {
          computedPromises.push(
              supabase.from('acc_portal_kyc').select('*').in('id', neededDocTypes)
              .then(({ data }) => { if(data) documentCache.docTypes = data; })
          );

          if (remainingPeople.length > 0) {
              computedPromises.push(
                  supabase.from('acc_portal_directors_documents')
                  .select('*')
                  .in('director_id', remainingPeople)
                  .in('document_id', neededDocTypes)
                  .neq('status', 'deleted')
                  .then(({ data }) => { 
                      if(data) documentCache.documents.push(...data); 
                  })
              );
          }
      }

      await Promise.all(computedPromises);

      // 4. PROCESS COMPUTED VALUES (USING CACHE)
      if (computedMasterFields.length > 0) {
        const newComputedValues: Record<string, string | string[]> = {};
        
        await Promise.all(computedMasterFields.map(async (item) => {
          const { field, entityId, extractionMode } = item;
          const config = field.computed_config || {};
          const docs = config.document_ids || [];
          const source = field.sources?.[0];
          let val: string | string[];

          if (source && source.path && source.source_type === 'document') {
            val = await executeComputedField(
              'extractFieldFromLatestDocument',
              entityId,
              docs,
              source.path,
              extractionMode,
              documentCache
            );
          } else if (config.computed_function) {
            val = await executeComputedField(
                config.computed_function, 
                entityId, 
                docs, 
                undefined, 
                extractionMode,
                documentCache
            );
          } else {
            val = "No Config";
          }
          newComputedValues[`${field.id}_${entityId}_${extractionMode}`] = val;
        }));
        setMasterFieldComputedValues(newComputedValues);
      }
      
      setSourceData(newSourceData);
      
    } catch (error) {
      console.error("Fetch Error:", error);
    } finally {
      isFetchingRef.current = false;
      setIsLoadingData(false);
    }
  }, [jobFields, selectedAutomationId, webData, resolveTargetEntityId, relationshipData, isOpen]);

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
    if (field.is_computed || field.computed_config?.is_computed) {
      const key = `${field.id}_${entityId}_${extractionMode}`;
      const val = masterFieldComputedValues[key];
      if (val === undefined) return "Computing...";
      return val;
    }
    const source = field.sources?.[sourceIdx];
    if (!source) return "No Source";
    return getSourceValue(source.table, source.path, String(entityId));
  };

  // --- DOCUMENT FETCHER (OPTIMIZED - Reuses cache if possible) ---
  const fetchDocumentFiles = useCallback(async () => {
    // Guard: Don't fetch if not ready
    if (!isOpen || !selectedAutomationId || !webData.length) {
      return;
    }

    // Guard: Prevent duplicate fetches
    if (isLoadingDocuments) {
      console.log('[fetchDocumentFiles] Already loading, skipping...');
      return;
    }

    setIsLoadingDocuments(true);
    const activeAutomation = webData.find(w => w.automationId === selectedAutomationId);
    if (!activeAutomation) { 
      setIsLoadingDocuments(false); 
      return; 
    }

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
      
      // OPTIMIZATION: Check if data is already in sourceData cache
      const cachedPersonDocs = sourceData['acc_portal_directors_documents'];
      if (cachedPersonDocs && personIds.size > 0) {
        // Filter from cache instead of fetching
        const cached = Object.values(cachedPersonDocs).filter((doc: any) => 
          personIds.has(String(doc.director_id)) && requiredKycIds.has(doc.document_id)
        );
        if (cached.length > 0) {
          results.push(...cached.map(d => ({ ...d, owner_type: 'person', owner_id: String(d.director_id) })));
        }
      } else if (personIds.size > 0 && requiredKycIds.size > 0) {
        // Fallback to network
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
  }, [selectedAutomationId, webData, resolveTargetEntityId, sourceData, isOpen]);

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
          const directIds = fields.flatMap((f: any) => f.masterFieldIds || []);
          const arrayIds = fields.flatMap((f: any) =>
            (f.arrayItems || []).map((item: any) => item.linkedMasterFieldId)
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
      } catch (error) { console.error('Error auto-computing fields:', error); } finally { setIsComputing(false); }
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
              if (col.linkedMasterFieldId) {
                const field = jobFields[col.linkedMasterFieldId];
                if (field?.is_computed || field?.computed_config?.is_computed) {
                  const key = `${field.id}_${id}_${col.extractionMode || 'latest'}`;
                  val = masterFieldComputedValues[key];
                } else if (field?.sources?.[0]) {
                  val = getSourceValue(field.sources[0].table, field.sources[0].path, String(id));
                  if (val === 'Missing') val = '';
                }
              }
              return { ...col, value: val };
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
        const values = (f.masterFieldIds || []).map((mid: string) => {
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

  const cancelEditing = () => {
    setEditingCell(null);
    setEditValue('');
  }

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

  // --- RENDER TABLE (Same as before, truncated for brevity) ---
  const renderFieldsTable = () => {
    if (!activeWebEntry?.fields || activeWebEntry.fields.length === 0) return <div className="p-12 text-center text-slate-400">No fields configured.</div>;
    
    const allFields = activeWebEntry.fields.filter((f: any) => f.fieldType !== 'computed');
    const computedFields = activeWebEntry.fields.filter((f: any) => f.fieldType === 'computed');

    // Pre-calculate Missing Status for Sorting
    const processedFields = allFields.map(field => {
        let isMissing = false;
        
        if (field.fieldType === 'array') {
             const entityIds = resolveEntityIdsForArray(field, relationshipData);
             if (entityIds.length === 0) isMissing = true;
        } else if (field.fieldType === 'document') {
             const targetId = resolveTargetEntityId(field);
             const foundDoc = documentFiles.find(d => d.document_id === field.kycDocumentId && String(d.owner_id) === String(targetId));
             if (!foundDoc) isMissing = true;
        } else {
             const targetId = resolveTargetEntityId(field);
             if (!targetId) {
                 isMissing = true;
             } else {
                 const masterIds = field.masterFieldIds || [];
                 const mergedValue = masterIds.map(mid => {
                     const v = getFieldValue(mid, String(targetId), 0, field.extractionMode || 'latest');
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
      <div className="flex flex-col h-full space-y-4">
        <div className="flex items-center justify-between px-2">
            <div className="flex items-center gap-4">
                <Badge variant="outline" className="px-3 py-1 bg-white border-slate-200 text-slate-600 gap-2">
                    Total Fields: <span className="font-bold text-slate-900">{processedFields.length}</span>
                </Badge>
                {missingCount > 0 && (
                    <Badge variant="destructive" className="px-3 py-1 bg-red-100 text-red-700 hover:bg-red-200 border-red-200 gap-2">
                        Missing Data: <span className="font-bold">{missingCount}</span>
                    </Badge>
                )}
            </div>
            <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-slate-500">View:</span>
                <Button 
                    variant={sortMissingFirst ? "secondary" : "outline"} 
                    size="sm" 
                    onClick={() => setSortMissingFirst(!sortMissingFirst)}
                    className={cn("h-8 text-xs gap-2", sortMissingFirst && "bg-blue-100 text-blue-700 hover:bg-blue-200")}
                >
                    <Filter className="h-3 w-3" />
                    {sortMissingFirst ? "Priority (Missing First)" : "Default Order"}
                </Button>
            </div>
        </div>

        <div className="flex-1 border border-slate-200 shadow-sm bg-white flex flex-col overflow-hidden rounded-xl">
          <ScrollArea className="flex-1 w-full h-full">
            <Table className="w-full border-collapse">
              <TableHeader className="bg-blue-600 sticky top-0 z-20 shadow-md">
                <TableRow className="border-none hover:bg-blue-600">
                  <TableHead className="w-[50px] text-xs font-bold text-blue-100 text-center h-10 border-r border-blue-500/50">#</TableHead>
                  <TableHead className="w-[280px] text-xs font-bold text-white h-10 border-r border-blue-500/50">Target Variable</TableHead>
                  <TableHead className="w-[120px] text-xs font-bold text-white h-10 border-r border-blue-500/50">Type</TableHead>
                  <TableHead className="w-[350px] text-xs font-bold text-white h-10 border-r border-blue-500/50">Source Path</TableHead>
                  <TableHead 
                        className="text-xs font-bold text-white h-10 cursor-pointer hover:bg-blue-500 transition-colors select-none group border-r border-blue-500/50"
                        onClick={() => setSortMissingFirst(!sortMissingFirst)}
                  >
                        <div className="flex items-center gap-2">
                            Current Value / Status
                            <ArrowUpDown className={cn("h-3 w-3 transition-opacity", sortMissingFirst ? "opacity-100" : "opacity-40 group-hover:opacity-100")} />
                        </div>
                  </TableHead>
                  <TableHead className="w-[80px] text-xs font-bold text-white h-10 text-right pr-4">Actions</TableHead>
                </TableRow>
              </TableHeader>
               <TableBody>
                {sortedFields.map((field, fIdx) => {
                  const isEditing = editingCell?.fieldId === field.variableName;
                  
                  // --- CASE 1: ARRAYS ---
                  if (field.fieldType === 'array') {
                    const entityIds = resolveEntityIdsForArray(field, relationshipData);
                    return (
                      <TableRow key={fIdx} className="bg-slate-50/30 hover:bg-slate-50 border-b border-slate-100">
                        <TableCell className="text-center text-xs text-slate-400 font-mono py-3 border-r border-slate-50">{fIdx + 1}</TableCell>
                        <TableCell className="py-3 align-top border-r border-slate-50">
                          <div className="flex flex-col gap-1">
                             <div className="text-sm font-semibold text-slate-800">{field.efnsDisplayName || field.variableName}</div>
                            </div>
                        </TableCell>
                        <TableCell className="py-3 align-top border-r border-slate-50"><Badge variant="outline" className="text-[10px] font-medium border-blue-200 text-blue-700 bg-blue-50">Array List</Badge></TableCell>
                        <TableCell colSpan={3} className="p-2 align-top">
                          <div className="rounded-lg border border-slate-200 bg-white overflow-hidden shadow-sm">
                            <Table>
                              <TableHeader className="bg-slate-50 border-b border-slate-100">
                                <TableRow>
                                  <TableHead className="h-8 text-[10px] font-bold uppercase w-[40px] text-slate-500">#</TableHead>
                                  {(field.arrayItems || []).map((col: any, i: number) => (
                                    <TableHead key={i} className="h-8 text-[10px] font-bold uppercase text-slate-600">
                                      {col.name}
                                    </TableHead>
                                  ))}
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {entityIds.length === 0 ? (
                                  <TableRow><TableCell colSpan={10} className="text-center text-xs py-3 text-slate-400 italic">No related entities found to populate this array.</TableCell></TableRow>
                                ) : (
                                  entityIds.map((id: string, entityIdx: number) => {
                                    const columnsData = (field.arrayItems || []).map((col: any) => {
                                      let val: any = 'Manual/Unmapped';
                                      if (col.linkedMasterFieldId) {
                                        const mField = jobFields[col.linkedMasterFieldId];
                                        if (mField?.is_computed || mField?.computed_config?.is_computed) {
                                          const key = `${mField.id}_${id}_${col.extractionMode || 'latest'}`;
                                          val = masterFieldComputedValues[key];
                                        } else if (mField?.sources?.[0]) {
                                          val = getSourceValue(mField.sources[0].table, mField.sources[0].path, String(id));
                                        }
                                      }
                                      return { ...col, value: val };
                                    });

                                    const maxSubRows = Math.max(1, ...columnsData.map((c: any) => Array.isArray(c.value) ? c.value.length : 1));

                                    return Array.from({ length: maxSubRows }).map((_, subRowIdx) => (
                                      <TableRow key={`${entityIdx}-${subRowIdx}`} className="h-8 border-b border-slate-50 last:border-0 hover:bg-slate-50">
                                        <TableCell className="text-[10px] text-slate-400 text-center font-mono bg-slate-50/50">
                                          {entityIdx + 1}.{subRowIdx + 1}
                                        </TableCell>
                                        {columnsData.map((col: any, cIdx: number) => {
                                          let displayVal = col.value;
                                          if (Array.isArray(displayVal)) {
                                            displayVal = displayVal[subRowIdx] !== undefined ? displayVal[subRowIdx] : '';
                                          }
                                          const isMissing = !displayVal || displayVal === 'Missing';
                                          
                                          return (
                                            <TableCell key={cIdx} className="text-xs py-1 px-3 border-r border-slate-50 last:border-0">
                                               <span className={isMissing ? "text-red-500 text-[11px]" : "text-slate-700"}>
                                                 {isMissing ? "Missing" : displayVal}
                                               </span>
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

                  // --- CASE 2: DOCUMENTS ---
                  if (field.fieldType === 'document') {
                    const targetId = resolveTargetEntityId(field);
                    const foundDoc = documentFiles.find(d => d.document_id === field.kycDocumentId && String(d.owner_id) === String(targetId));
                    let entityLabel = "Principal";
                    if (field.entityTypes?.includes('company')) entityLabel = "Company";
                    else if (field.entityTypes?.includes('dependant')) entityLabel = "Dependant";

                    return (
                        <TableRow key={fIdx} className="group hover:bg-slate-50 border-b border-slate-100">
                             <TableCell className="text-center text-xs text-slate-400 font-mono py-3 border-r border-slate-50">{fIdx + 1}</TableCell>
                             <TableCell className="py-3 border-r border-slate-50">
                                <div className="flex flex-col gap-1">
                                    <div className="text-sm font-semibold text-slate-800">{field.efnsDisplayName || field.variableName}</div>
                                    </div>
                             </TableCell>
                             <TableCell className="py-3 border-r border-slate-50">
                                <Badge variant="outline" className="text-[10px] font-medium border-amber-200 text-amber-700 bg-amber-50">Document</Badge>
                             </TableCell>
                             <TableCell className="py-3 border-r border-slate-50">
                                <div className="flex items-center gap-2 text-xs text-slate-500">
                                    <User className="h-3 w-3" />
                                    <span>{entityLabel}</span>
                                    <span className="text-slate-300">|</span>
                                    <span>KYC ID: {field.kycDocumentId?.substring(0,8)}...</span>
                                </div>
                             </TableCell>
                             <TableCell className="py-3 border-r border-slate-50">
                                {foundDoc ? (
                                    <div className="flex items-center gap-2">
                                        <Badge className="bg-green-100 text-green-700 hover:bg-green-200 border border-green-200 px-2 py-0.5 h-6 shadow-none gap-1">
                                            <CheckCircle2 className="h-3 w-3" /> Found
                                        </Badge>
                                        <a href={buildFileUrl(foundDoc)} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                                            View <ExternalLink className="h-3 w-3" />
                                        </a>
                                    </div>
                                ) : (
                                    <Badge variant="outline" className="bg-red-50 text-red-600 border-red-200 px-2 py-0.5 h-6 gap-1">
                                        <AlertTriangle className="h-3 w-3" /> Missing
                                    </Badge>
                                )}
                             </TableCell>
                             <TableCell className="text-right py-3 pr-4">
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-300 cursor-not-allowed"><Edit3 className="h-3 w-3" /></Button>
                             </TableCell>
                        </TableRow>
                    )
                  }

                  // --- CASE 3: STANDARD FIELDS ---
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
                    const v = getFieldValue(mid, String(targetId), 0, field.extractionMode || 'latest');
                    return Array.isArray(v) ? v.join(', ') : v;
                  }).join(' ');

                  const isValueMissing = !mergedValue || mergedValue === 'Missing' || mergedValue === '';

                  return (
                    <TableRow key={fIdx} className="group hover:bg-slate-50 border-b border-slate-100">
                      <TableCell className="text-center text-xs text-slate-400 font-mono py-3 border-r border-slate-50">{fIdx + 1}</TableCell>
                      <TableCell className="py-3 align-top border-r border-slate-50">
                         <div className="flex flex-col gap-1">
                             <div className="text-sm font-semibold text-slate-800 truncate" title={field.variableName}>{field.efnsDisplayName || field.variableName}</div>
                             </div>
                      </TableCell>
                      <TableCell className="py-3 align-top border-r border-slate-50">
                         {field.fieldType === 'date' ? <Badge variant="outline" className="text-[10px] border-slate-200 text-slate-500">Date</Badge> : <Badge variant="outline" className="text-[10px] border-slate-200 text-slate-500">Text</Badge>}
                      </TableCell>
                      <TableCell className="py-3 align-top border-r border-slate-50">
                        <div className="flex flex-col gap-1">
                          {field.customFieldSource ? (
                            <span className="text-xs text-slate-600 italic">Custom: {field.customFieldSource}</span>
                          ) : (
                            sourcesDisplay.map((source, idx) => (
                              <div key={idx} className="flex items-center gap-1.5">
                                {source.type === 'computed' ? (
                                  <>
                                    <FunctionSquare className="h-3 w-3 text-purple-500 flex-shrink-0" />
                                    <span className="text-xs text-purple-700 truncate font-medium" title={source.info}>{source.label}</span>
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
                          {sourcesDisplay.length === 0 && !field.customFieldSource && <span className="text-xs text-slate-300 italic">No source mapped</span>}
                        </div>
                      </TableCell>
                      
                      {/* VALUE CELL WITH EDIT MODE */}
                      <TableCell className="py-2 align-middle border-r border-slate-50">
                        {isEditing ? (
                          <div className="flex items-center gap-2">
                             <div className="relative w-full max-w-[200px]">
                                <Input 
                                    autoFocus 
                                    value={editValue} 
                                    onChange={e => setEditValue(e.target.value)} 
                                    onKeyDown={e => {
                                        if(e.key === 'Enter') saveEdit();
                                        if(e.key === 'Escape') cancelEditing();
                                    }}
                                    className="h-8 text-xs pr-2" 
                                />
                             </div>
                             <div className="flex items-center gap-1">
                                <Button size="icon" onClick={saveEdit} className="h-8 w-8 bg-green-600 hover:bg-green-700 text-white"><Save className="h-4 w-4" /></Button>
                                <Button size="icon" variant="ghost" onClick={cancelEditing} className="h-8 w-8 text-slate-400 hover:text-red-500 hover:bg-red-50"><X className="h-4 w-4" /></Button>
                             </div>
                          </div>
                        ) : (
                          <div className={cn("text-sm break-words pr-2", isValueMissing ? "text-red-500 font-medium flex items-center gap-1.5" : "text-slate-700")}>
                            {isValueMissing ? (
                                <>
                                    <AlertCircle className="h-3 w-3" /> Missing
                                </>
                            ) : mergedValue}
                            {mergedValue === 'Computing...' && <Loader2 className="h-3 w-3 animate-spin inline ml-2 text-purple-500" />}
                          </div>
                        )}
                      </TableCell>

                      {/* ACTIONS CELL */}
                      <TableCell className="text-right py-2 pr-4">
                         {!isEditing && !isMissingEntity && sources[0] && sourcesDisplay.every(s => s.type !== 'computed') && (
                             <Button 
                                variant="ghost" 
                                size="icon" 
                                onClick={() => startEditing(field.variableName, 0, sources[0]?.table, sources[0]?.path, mergedValue, String(targetId))}
                                className="h-8 w-8 text-slate-400 hover:text-blue-600 hover:bg-blue-50 opacity-0 group-hover:opacity-100 transition-all"
                             >
                                <Edit3 className="h-4 w-4" />
                             </Button>
                         )}
                      </TableCell>
                    </TableRow>
                  );
                })}

                {/* COMPUTED FIELDS SECTION */}
                {computedFields.length > 0 && allFields.length > 0 && (
                  <TableRow className="bg-slate-50 border-y border-slate-200">
                    <TableCell colSpan={6} className="py-2 px-4">
                        <div className="flex items-center gap-2 text-slate-500 font-bold text-xs uppercase tracking-widest">
                            <Calculator className="h-3 w-3" /> System Calculated Fields
                        </div>
                    </TableCell>
                  </TableRow>
                )}
                
                {computedFields.map((field, fIdx) => (
                  <TableRow key={`computed-${fIdx}`} className="hover:bg-purple-50/20 border-b border-slate-100">
                    <TableCell className="text-center text-xs text-purple-400 bg-purple-50/10 font-mono py-3 border-r border-purple-100">{allFields.length + fIdx + 1}</TableCell>
                    <TableCell className="py-3 border-r border-purple-50/20"><div className="text-sm font-semibold text-slate-800">{field.efnsDisplayName || field.variableName}</div></TableCell>
                    <TableCell className="py-3 border-r border-purple-50/20"><Badge variant="secondary" className="bg-purple-100 text-purple-700 border-none text-[10px]">Computed</Badge></TableCell>
                    <TableCell className="py-3 border-r border-purple-50/20">
                        <div className="flex items-center gap-1.5 text-xs text-purple-600 font-medium font-mono bg-purple-50 w-fit px-2 py-0.5 rounded border border-purple-100">
                            <FunctionSquare className="h-3 w-3" /> {field.computedFunction}
                        </div>
                    </TableCell>
                    <TableCell className="py-3" colSpan={2}>
                        {isComputing ? 
                            <div className="flex items-center gap-2 text-xs text-slate-400"><Loader2 className="h-3 w-3 animate-spin" /> Calculating...</div> 
                            : computedFieldsPreview[field.variableName] ? 
                                <span className="text-sm font-bold text-green-700">{computedFieldsPreview[field.variableName]}</span> 
                                : <span className="text-xs text-slate-400 italic">Pending...</span>
                        }
                    </TableCell>
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
      <DialogContent className="max-w-[95vw] w-[1400px] h-[90vh] flex flex-col p-0 overflow-hidden border-none shadow-2xl bg-slate-50">
        {/* HEADER */}
        <div className="p-5 border-b bg-white flex items-center justify-between shadow-sm z-30">
          <div className="flex items-center gap-5">
            <div className="h-12 w-12 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-blue-200"><Zap className="h-6 w-6 fill-white" /></div>
            <div>
              <DialogTitle className="text-2xl font-black text-slate-900 tracking-tight">Automation Lab</DialogTitle>
              <div className="flex items-center gap-2 text-slate-500 font-medium text-sm mt-0.5"><span>Task #{task?.id}</span><ChevronRight className="h-4 w-4 text-slate-300" /><span className="text-slate-900">{task?.applicant_name}</span></div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 bg-slate-50 p-1.5 rounded-xl border border-slate-200">
               <Webhook className="h-4 w-4 text-slate-400 ml-2" />
               <Select value={selectedAutomationId} onValueChange={setSelectedAutomationId}>
                  <SelectTrigger className="w-[250px] border-none bg-transparent shadow-none h-8 text-sm font-bold text-slate-700 focus:ring-0">
                     <SelectValue placeholder="Select Workflow" />
                  </SelectTrigger>
                  <SelectContent>
                     {entityAutomationMappings.length > 0 ? (
                         entityAutomationMappings.map(m => (
                             <SelectItem key={m.automationId} value={m.automationId}>{m.automation?.name || "Unnamed Flow"}</SelectItem>
                         ))
                     ) : (
                         <div className="p-2 text-xs text-slate-400 italic text-center">No workflows found</div>
                     )}
                  </SelectContent>
               </Select>
            </div>

            <div className="h-8 w-px bg-slate-200 mx-2" />

            <div className="flex items-center gap-3 bg-slate-50 p-1.5 rounded-xl border border-slate-200">
               <div className="flex items-center gap-2 px-3 py-1.5 bg-white rounded-lg border border-slate-200 shadow-sm">
                  <User className="h-4 w-4 text-blue-500" />
                  <input value={currentIndividualId} onChange={(e) => setCurrentIndividualId(e.target.value)} placeholder="ID Number..." className="w-28 outline-none text-sm font-bold text-slate-700" />
               </div>
               {isLoading && <Loader2 className="h-5 w-5 animate-spin text-blue-600 mx-2" />}
            </div>
          </div>
        </div>

        {/* BODY */}
        <div className="flex-1 flex flex-col overflow-hidden bg-slate-50/50 relative">
            {!selectedAutomationId ? (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-300"><Webhook className="h-16 w-16 mb-4 opacity-10" /><p className="text-lg font-medium">Select a workflow from the header</p></div>
            ) : (
            <>
                <div className="px-8 py-4 bg-white border-b flex items-center justify-between flex-shrink-0">
                    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-fit">
                        <TabsList className="bg-slate-100 p-1 h-10 rounded-lg">
                        <TabsTrigger value="fields" className="px-6 text-xs font-bold"><Database className="h-3 w-3 mr-2" /> Data Map</TabsTrigger>
                        <TabsTrigger value="documents" className="px-6 text-xs font-bold"><FileText className="h-3 w-3 mr-2" /> Gallery</TabsTrigger>
                        </TabsList>
                    </Tabs>
                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild><div className="flex items-center gap-2 cursor-help"><div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" /><span className="text-xs font-medium text-slate-500">Webhook Ready</span></div></TooltipTrigger>
                            <TooltipContent><p className="text-xs">{selectedMapping?.automation?.webhook_url}</p></TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                </div>

                <div className="flex-1 overflow-hidden p-6">
                    <Tabs value={activeTab} className="h-full w-full">
                        <TabsContent value="fields" className="h-full m-0 flex flex-col">
                            {renderFieldsTable()}
                        </TabsContent>
                        <TabsContent value="documents" className="h-[full] overflow-auto">
                            {renderDocumentsSection()}
                        </TabsContent>
                    </Tabs>
                </div>
            </>
            )}
        </div>

        {/* FOOTER */}
        <div className="p-5 border-t bg-white flex justify-between items-center z-30">
          <Button variant="ghost" className="font-bold text-slate-500 hover:text-slate-700" onClick={onClose}>Close</Button>
          <Button onClick={handleRunAutomation} disabled={isAutomationRunning} className="bg-blue-600 hover:bg-blue-700 text-white h-11 px-8 rounded-xl font-bold shadow-md shadow-blue-100 flex items-center gap-2 transition-all">
            {isAutomationRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4 fill-white" />}<span>Execute Workflow</span>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};