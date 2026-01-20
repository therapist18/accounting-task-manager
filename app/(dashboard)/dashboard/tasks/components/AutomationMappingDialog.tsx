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
  FunctionSquare
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
import { processComputedFields } from '../utils/automationComputedFunctions';

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

export const AutomationMappingDialog = ({
  isOpen,
  onClose,
  classId,
  taskId,
  task,
  individualId,
  allDocuments = [],
  stage
}: AutomationMappingDialogProps) => {
  // --- STATE ---
  const [isLoading, setIsLoading] = useState(false);
  const [isAutomationRunning, setIsAutomationRunning] = useState(false);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [isLoadingDocuments, setIsLoadingDocuments] = useState(false);
  const [webData, setWebData] = useState<any[]>([]);
  const [jobFields, setJobFields] = useState<Record<string, any>>({});
  const [sourceData, setSourceData] = useState<Record<string, any>>({});
  const [documentFiles, setDocumentFiles] = useState<any[]>([]);
  const [entityAutomationMappings, setEntityAutomationMappings] = useState<EntityAutomationMapping[]>([]);
  const [selectedAutomationId, setSelectedAutomationId] = useState<string>('');
  const [editingCell, setEditingCell] = useState<any>(null);
  const [editValue, setEditValue] = useState('');
  const [activeTab, setActiveTab] = useState('fields');
  const [currentIndividualId, setCurrentIndividualId] = useState(individualId || task?.individual_id?.toString() || '');
  const [computedFieldsPreview, setComputedFieldsPreview] = useState<Record<string, string>>({});
  const [isComputing, setIsComputing] = useState(false);

  // --- HELPERS ---
  const buildFileUrl = (linkedDoc: any): string | null => {
    if (!linkedDoc?.file_path) return null;
    const bucketName = 'kyc-documents';
    const filePath = linkedDoc.file_path?.startsWith(bucketName) ? linkedDoc.file_path : `${bucketName}/${linkedDoc.file_path}`;
    return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${filePath}`;
  };

  const getDocumentUrlWithFallback = useCallback((): string | null => {
    if (!task?.individual_id) return null;

    // Strategy 1: Specific stage link
    if (stage && task?.source_document_id?.[stage.id]) {
      const docId = typeof task.source_document_id[stage.id] === 'string' ? task.source_document_id[stage.id] : task.source_document_id[stage.id].id;
      const linkedDoc = allDocuments.find(doc => doc.id === docId);
      if (linkedDoc) return buildFileUrl(linkedDoc);
    }

    // Strategy 2: Any linked document in the task
    if (task?.source_document_id) {
      for (const docData of Object.values(task.source_document_id)) {
        const docId = typeof docData === 'string' ? docData : (docData as any)?.id;
        const linkedDoc = allDocuments.find(doc => doc.id === docId);
        if (linkedDoc?.file_path) return buildFileUrl(linkedDoc);
      }
    }

    // Strategy 3: Most recent document for individual
    const individualDocs = allDocuments.filter(doc => (doc.director_id?.toString() === task.individual_id?.toString()) && doc.file_path && doc.status !== 'deleted');
    if (individualDocs.length > 0) {
      return buildFileUrl(individualDocs.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())[0]);
    }

    return null;
  }, [stage, task, allDocuments]);

  // --- DATA FETCHING ---
  const fetchSourceData = useCallback(async (id: string) => {
    if (!id || Object.keys(jobFields).length === 0) return;
    setIsLoadingData(true);
    try {
      const sourceDataMap: Record<string, any> = {};
      const allSources = Object.values(jobFields).flatMap(field => field.sources || []);
      const uniqueTables = [...new Set(allSources.map(source => source.table))];

      for (const table of uniqueTables) {
        const queryField = table === 'acc_portal_directors_documents' ? 'director_id' : (table === 'tm_tasks' ? 'id' : 'id');
        const queryVal = table === 'tm_tasks' ? taskId : id;
        const { data } = await supabase.from(table).select('*').eq(queryField, queryVal).maybeSingle();
        sourceDataMap[table] = data || {};
      }
      setSourceData(sourceDataMap);
    } finally {
      setIsLoadingData(false);
    }
  }, [jobFields, taskId]);

  const fetchDocumentFiles = useCallback(async (id: string) => {
    if (!id || !webData.length) return;
    setIsLoadingDocuments(true);
    try {
      const kycIds = webData.flatMap(item => (item.kycDocsUpload || []).map(u => u.kycDocumentId)).filter(Boolean);
      const { data } = await supabase.from('acc_portal_directors_documents').select('*, kyc_document:acc_portal_kyc!document_id(*)').eq('director_id', id).in('document_id', kycIds).neq('status', 'deleted');
      setDocumentFiles(data || []);
    } finally {
      setIsLoadingDocuments(false);
    }
  }, [webData]);

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
        if (!requirement) {
          console.log('❌ No requirement found for job level:', jl);
          return;
        }
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
            return {
              ...ref,
              fields: autoDef?.webdata || [],
              automationName: autoDef?.name,
              automation: autoDef
            };
          }).filter(item => item.automationId);

          setWebData(finalWebDataItems);
        } else {
          console.log('ℹ️ No automation IDs found for this requirement');
          setWebData([]);
        }

        const mappings = finalWebDataItems.map((item, idx) => ({
          entityKey: `wd-${idx}`,
          entityName: item.documentName || item.automationName || `Flow ${idx + 1}`,
          entityType: 'webdata',
          automationId: item.automationId,
          documentId: item.documentId,
          automation: item.automation
        }));

        setEntityAutomationMappings(mappings);

        if (mappings.length > 0) {
          const exists = mappings.some(m => m.automationId === selectedAutomationId);
          if (!selectedAutomationId || !exists) {
            setSelectedAutomationId(mappings[0].automationId);
          }
        } else {
          setSelectedAutomationId('');
        }

        const fieldIds = finalWebDataItems.flatMap(i => i.fields?.flatMap((f: any) => f.masterFieldIds || []) || []).filter(Boolean);
        if (fieldIds.length > 0) {
          const { data: fields } = await supabase.from('tm_job_fields').select('*').in('id', fieldIds);
          setJobFields(fields?.reduce((acc, f) => ({ ...acc, [f.id.toString()]: f }), {}) || {});
        }

      } catch (error) {
        console.error('Error in fetchData:', error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, [isOpen, task?.job_level]);

  useEffect(() => {
    if (isOpen && currentIndividualId) {
      fetchSourceData(currentIndividualId);
      fetchDocumentFiles(currentIndividualId);
    }
  }, [currentIndividualId, isOpen, jobFields]);

  // --- AUTOMATIC COMPUTED FIELDS CALCULATION ---
  useEffect(() => {
    const runComputation = async () => {
      if (!currentIndividualId || !selectedAutomationId) return;

      const activeWeb = webData.find(w => w.automationId === selectedAutomationId);
      const computedFields = activeWeb?.fields
        ?.filter((f: any) => f.fieldType === 'computed')
        ?.map((f: any) => ({
          variableName: f.variableName,
          computedFunction: f.computedFunction,
          computedDocuments: f.computedDocuments || []
        })) || [];

      if (computedFields.length === 0) {
        setComputedFieldsPreview({});
        return;
      }

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

    const timer = setTimeout(runComputation, 500); // Debounce slightly
    return () => clearTimeout(timer);
  }, [currentIndividualId, selectedAutomationId, webData]);


  // --- ACTIONS ---
  const startEditing = (fieldId: string, sourceIdx: number, table: string, path: string, val: string) => {
    setEditingCell({ fieldId, sourceIdx, table, path });
    setEditValue(val === 'Missing' ? '' : val);
  };

  const saveEdit = async () => {
    if (!editingCell || !currentIndividualId) return;
    const { table, path } = editingCell;
    setIsLoadingData(true);
    try {
      const queryField = table === 'acc_portal_directors_documents' ? 'director_id' : 'id';
      const { data: existing } = await supabase.from(table).select('*').eq(queryField, currentIndividualId).maybeSingle();
      const updated = updateJsonValue(existing || {}, path, editValue);

      const { error } = await supabase.from(table).upsert({
        [queryField]: currentIndividualId,
        ...updated,
        updated_at: new Date().toISOString()
      });

      if (error) throw error;
      toast({ title: 'Success', description: 'Field updated' });
      await fetchSourceData(currentIndividualId);
    } catch (e) {
      toast({ title: 'Error', description: 'Update failed', variant: 'destructive' });
    } finally {
      setIsLoadingData(false);
      setEditingCell(null);
    }
  };

  const handleRunAutomation = async () => {
    if (!selectedAutomationId || !currentIndividualId) {
      toast({ title: "Validation Error", description: "Missing automation selection or Individual ID", variant: "destructive" });
      return;
    }

    setIsAutomationRunning(true);
    try {
      const mapping = entityAutomationMappings.find(m => m.automationId === selectedAutomationId);
      if (!mapping?.automation) throw new Error("Automation configuration not found");

      const automation = mapping.automation;
      const automationLogin = automation.login || {};

      // 1. Gather mapped formData for regular fields
      const formData: Record<string, any> = {};
      const activeWeb = webData.find(w => w.automationId === selectedAutomationId);

      activeWeb?.fields?.forEach(f => {
        // Skip document and computed fields - they're handled separately
        if (f.fieldType === 'document' || f.fieldType === 'computed') return;

        const values = (f.masterFieldIds || []).map(mid => {
          const field = jobFields[mid];
          if (!field?.sources?.[0]) return null;
          const val = getSourceValue(field.sources[0].table, field.sources[0].path);
          return val === 'Missing' ? null : val;
        }).filter(Boolean);

        if (values.length > 0) {
          formData[f.variableName] = values.join(' ');
        }
      });

      // 2. Process computed fields (Re-run safely before submit)
      const computedFields = activeWeb?.fields
        ?.filter(f => f.fieldType === 'computed')
        ?.map(f => ({
          variableName: f.variableName,
          computedFunction: f.computedFunction,
          computedDocuments: f.computedDocuments || []
        })) || [];

      if (computedFields.length > 0) {
        console.log('🔄 Verifying computed fields...', computedFields);
        const computedResults = await processComputedFields(currentIndividualId, computedFields);
        Object.assign(formData, computedResults);
      }

      // 3. Construct the final payload
      const payload = {
        url: automationLogin.url || "https://fns.immigration.go.ke/account/login.html",
        photoPath: getDocumentUrlWithFallback() || "",
        login: {
          email: automationLogin.email || "",
          idNumber: automationLogin.idNumber || "",
          password: automationLogin.password || ""
        },
        formData: formData,
        step2Data: {},
        step3Data: {}
      };

      console.log("🚀 Triggering Automation with Payload:", payload);

      const res = await fetch(automation.webhook_url, {
        method: automation.webhook_method || 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || "Trigger failed: Server returned " + res.status);
      }

      toast({ title: 'Success', description: 'Automation process initiated successfully' });
    } catch (e) {
      console.error("❌ Automation Error:", e);
      toast({ title: 'Automation Error', description: e.message, variant: 'destructive' });
    } finally {
      setIsAutomationRunning(false);
    }
  };

  const getSourceValue = (table: string, path: string) => {
    const data = sourceData[table];
    if (!data) return "Missing";
    const val = parseJsonValue(data, path);
    return val !== undefined && val !== null ? String(val) : "Missing";
  };

  const selectedMapping = useMemo(() => entityAutomationMappings.find(m => m.automationId === selectedAutomationId), [selectedAutomationId, entityAutomationMappings]);
  const activeWebEntry = useMemo(() => webData.find(e => e.automationId === selectedAutomationId), [selectedAutomationId, webData]);

  // --- RENDER HELPERS ---
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
                  {/* --- REGULAR FIELDS --- */}
                  {regularFields.map((field, fIdx) => {
                    const masterIds = field.masterFieldIds || [];
                    const sources = masterIds.map(mid => {
                        const f = jobFields[mid];
                        return f?.sources?.[0] ? { ...f.sources[0], label: f.label } : null;
                    }).filter(Boolean);
                    
                    const mergedValue = sources.map(s => getSourceValue(s.table, s.path)).filter(v => v !== 'Missing').join(' ');
                    const isEditing = editingCell?.fieldId === field.variableName;
                    
                    if (sources.length === 0) {
                         return (
                            <TableRow key={fIdx} className="h-9 hover:bg-slate-50">
                                <TableCell className="text-center text-xs text-slate-400 bg-slate-50 border-r border-slate-200 border-b">{fIdx + 1}</TableCell>
                                <TableCell className="border-r border-b border-slate-200 px-2 py-1 text-sm font-medium text-slate-700 bg-slate-50/30">{field.efnsDisplayName || field.name}</TableCell>
                                <TableCell className="border-r border-b border-slate-200 px-2 py-1 text-xs text-slate-400 italic" colSpan={2}>No database mapping configured</TableCell>
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
                                        <div className="text-xs text-slate-600 truncate" title={field.customFieldSource}>
                                            {field.customFieldSource}
                                        </div>
                                    ) : (
                                        sources.map((source, idx) => (
                                            <div key={idx} className="text-xs text-slate-600 truncate" title={`${source.table}.${source.path}`}>
                                                {source.table.replace('acc_portal_', '').replace('tm_', '')}.{source.path} ({source.label})
                                            </div>
                                        ))
                                    )}
                                </div>
                            </TableCell>
                            <TableCell className="border-b border-slate-300 p-0 relative h-9 align-middle">
                                {isEditing ? (
                                    <div className="w-full h-full flex">
                                         <Input
                                            autoFocus
                                            value={editValue}
                                            onChange={e => setEditValue(e.target.value)}
                                            onKeyDown={e => e.key === 'Enter' && saveEdit()}
                                            onBlur={saveEdit}
                                            className="w-full h-full rounded-none border-none focus-visible:ring-0 px-2 text-sm bg-blue-50 text-slate-900"
                                        />
                                    </div>
                                ) : (
                                    <div 
                                        onClick={() => startEditing(field.variableName, 0, sources[0]?.table, sources[0]?.path, mergedValue)}
                                        className={cn(
                                            "w-full h-full px-2 flex items-center cursor-text hover:bg-blue-50 transition-colors select-none text-sm",
                                            mergedValue === '' ? "text-red-500 italic bg-red-50/30" : "text-slate-800"
                                        )}
                                    >
                                        <span className="truncate">{mergedValue || 'Missing'}</span>
                                        {mergedValue === '' && <AlertCircle className="h-3 w-3 ml-2 text-red-400 opacity-50" />}
                                    </div>
                                )}
                            </TableCell>
                        </TableRow>
                    );
                })}

                  {/* --- SEPARATOR --- */}
                  {computedFields.length > 0 && regularFields.length > 0 && (
                     <TableRow className="bg-slate-100 border-b-2 border-slate-300">
                        <TableCell colSpan={5} className="py-2 px-4">
                            <div className="flex items-center gap-2 text-slate-500 font-bold text-xs uppercase tracking-widest">
                                <Calculator className="h-4 w-4" /> Computed Automatically
                            </div>
                        </TableCell>
                     </TableRow>
                  )}

                  {/* --- COMPUTED FIELDS --- */}
                  {computedFields.map((field, fIdx) => (
                    <TableRow key={`computed-${fIdx}`} className="h-9 hover:bg-purple-50/30 transition-colors">
                        <TableCell className="text-center text-xs text-purple-400 bg-purple-50/30 border-r border-b border-slate-300">
                           {regularFields.length + fIdx + 1}
                        </TableCell>
                        <TableCell className="border-r border-b border-slate-300 px-2 py-0 align-middle">
                            <div className="text-sm font-semibold text-slate-800 truncate" title={field.variableName}>
                                {field.efnsDisplayName || field.variableName}
                            </div>
                        </TableCell>
                        <TableCell className="border-r border-b border-slate-300 px-2 py-0 align-middle bg-purple-50/10">
                            <div className="flex flex-col gap-1">
                                <div className="flex items-center gap-1.5 overflow-hidden">
                                    <FunctionSquare className="h-3 w-3 text-purple-400 flex-shrink-0" />
                                    <span className="text-xs text-purple-700 truncate" title={field.computedFunction}>
                                        {field.computedFunction}
                                    </span>
                                </div>
                            </div>
                        </TableCell>
                        <TableCell className="border-b border-slate-300 px-2 py-0 align-middle bg-slate-50/50">
                            {isComputing ? (
                                <div className="flex items-center gap-2 text-xs text-slate-400">
                                    <Loader2 className="h-3 w-3 animate-spin" /> Calculating...
                                </div>
                            ) : computedFieldsPreview[field.variableName] ? (
                                <span className="text-sm font-bold text-green-700 truncate block" title={computedFieldsPreview[field.variableName]}>
                                    {computedFieldsPreview[field.variableName]}
                                </span>
                            ) : (
                                <span className="text-xs text-slate-400 italic">Pending...</span>
                            )}
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
    const requiredDocs = activeWebEntry?.fields?.filter((f: any) => f.fieldType === 'document') || [];
    const legacyDocs = activeWebEntry?.kycDocsUpload || [];
    const allReqs = [...requiredDocs, ...legacyDocs.map((d: any) => ({
      kycDocumentId: d.kycDocumentId,
      efnsDisplayName: d.documentName || d.entityType,
      variableName: d.kycDocumentId
    }))];
    const uniqueReqs = Array.from(new Map(allReqs.map(item => [item.kycDocumentId, item])).values());

    if (uniqueReqs.length === 0) return <div className="p-12 text-center text-slate-400">No document assets configured.</div>;

    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {uniqueReqs.map((req, idx) => {
          const found = documentFiles.find(d => d.document_id === req.kycDocumentId);
          return (
            <Card key={idx} className={cn("overflow-hidden border-2 transition-all", found ? "border-green-100 shadow-sm" : "border-amber-100 shadow-none bg-amber-50/20")}>
              <CardContent className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className={cn("p-3 rounded-xl", found ? "bg-green-100 text-green-600" : "bg-amber-100 text-amber-600")}>
                    <FileText className="h-5 w-5" />
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-900 leading-tight">{req.efnsDisplayName || req.name || 'Document'}</h4>
                    <p className="text-[10px] text-slate-400">ID: {req.kycDocumentId}</p>
                    {req.variableName && <p className="text-[10px] text-blue-400">Var: {req.variableName}</p>}
                  </div>
                </div>
                {found ? (
                  <Badge className="bg-green-500 hover:bg-green-600 gap-1.5 py-1 px-3">
                    <CheckCircle2 className="h-3 w-3" /> Ready
                  </Badge>
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

  // --- MAIN RENDER ---
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-[95vw] w-[1400px] h-[90vh] flex flex-col p-0 overflow-hidden border-none shadow-2xl">
        <div className="p-5 border-b bg-white flex items-center justify-between shadow-sm z-20">
          <div className="flex items-center gap-5">
            <div className="h-12 w-12 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-blue-200">
              <Zap className="h-6 w-6 fill-white" />
            </div>
            <div>
              <DialogTitle className="text-2xl font-black text-slate-900 tracking-tight">Automation Lab</DialogTitle>
              <div className="flex items-center gap-2 text-slate-500 font-medium text-sm mt-0.5">
                <span>Task #{task?.id}</span>
                <ChevronRight className="h-4 w-4 text-slate-300" />
                <span className="text-slate-900">{task?.applicant_name}</span>
              </div>
            </div>
          </div>

<div className="px-3 space-y-2 pb-5">
                {entityAutomationMappings.map((mapping) => (
                  <button
                    key={mapping.automationId}
                    onClick={() => setSelectedAutomationId(mapping.automationId)}
                    className={cn(
                      "w-full text-left p-4 rounded-2xl border-2 transition-all group relative",
                      selectedAutomationId === mapping.automationId
                        ? "bg-blue-50/50 border-blue-600 shadow-sm"
                        : "hover:bg-slate-50 border-transparent"
                    )}
                  >
                    <div className="flex items-center gap-4">
                      <div className={cn(
                        "h-10 w-10 rounded-xl flex items-center justify-center transition-all",
                        selectedAutomationId === mapping.automationId ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-400 group-hover:bg-slate-200"
                      )}>
                        <Webhook className="h-5 w-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={cn("text-sm font-bold truncate", selectedAutomationId === mapping.automationId ? "text-blue-900" : "text-slate-700")}>
                          {mapping.automation?.name || "Unnamed Flow"}
                        </p>
                      </div>
                    </div>
                    {selectedAutomationId === mapping.automationId && (
                      <div className="absolute right-4 top-1/2 -translate-y-1/2">
                        <div className="h-2 w-2 rounded-full bg-blue-600 animate-pulse" />
                      </div>
                    )}
                  </button>
                ))}
                {entityAutomationMappings.length === 0 && (
                  <div className="p-10 text-center space-y-3">
                    <Settings className="h-10 w-10 text-slate-200 mx-auto" />
                    <p className="text-xs text-slate-400 font-medium">No automations configured for this class level.</p>
                  </div>
                )}
              </div>

          <div className="flex items-center gap-3 bg-slate-50 p-1.5 rounded-2xl border border-slate-200">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-white rounded-xl border border-slate-200 shadow-sm">
              <User className="h-4 w-4 text-blue-500" />
              <input
                value={currentIndividualId}
                onChange={(e) => setCurrentIndividualId(e.target.value)}
                placeholder="ID Number..."
                className="w-32 outline-none text-sm font-bold text-slate-700"
              />
            </div>
            {isLoading && <Loader2 className="h-5 w-5 animate-spin text-blue-600 mx-2" />}
          </div>
        </div>

        <div className="flex-1 flex overflow-hidden bg-slate-50/50">
          <div className="flex-1 flex flex-col overflow-hidden">
            {!selectedAutomationId ? (
              <div className="flex-1 flex flex-col items-center justify-center text-slate-300">
                <Webhook className="h-16 w-16 mb-4 opacity-10" />
                <p className="text-lg font-medium">Select a workflow from the sidebar</p>
              </div>
            ) : (
              <>
                <div className="px-8 py-4 bg-white border-b flex items-center justify-between flex-shrink-0">
                  <Tabs value={activeTab} onValueChange={setActiveTab} className="w-fit">
                    <TabsList className="bg-slate-100/80 p-1 h-11 rounded-xl">
                      <TabsTrigger value="fields" className="rounded-lg px-6 data-[state=active]:shadow-sm">
                        <Database className="h-4 w-4 mr-2" /> Data Map
                      </TabsTrigger>
                      <TabsTrigger value="documents" className="rounded-lg px-6 data-[state=active]:shadow-sm">
                        <FileText className="h-4 w-4 mr-2" /> Assets
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>

                  <div className="flex items-center gap-4">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="flex flex-col items-end">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">Status</span>
                            <div className="flex items-center gap-1.5 text-green-600 font-bold text-sm">
                              <CheckCircle2 className="h-4 w-4" /> Endpoint Active
                            </div>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent className="bg-slate-900 text-white border-none p-3">
                          <p className="text-xs">{selectedMapping?.automation?.webhook_url}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                </div>

                <div className="flex-1 overflow-hidden relative">
                  <Tabs value={activeTab} className="h-full w-full">
                    <TabsContent value="fields" className="h-full m-0 p-8 flex flex-col overflow-hidden data-[state=active]:flex">
                      <div className="mb-4 flex items-center justify-between flex-shrink-0">
                        <div>
                          <h2 className="text-xl font-bold text-slate-900">Field Correspondence</h2>
                          <p className="text-sm text-slate-500">Mapping master database fields to the target automation schema.</p>
                        </div>
                        <Badge variant="outline" className="px-4 py-1 text-blue-600 border-blue-100 bg-blue-50/50">
                          {activeWebEntry?.fields?.filter((f: any) => f.fieldType !== 'document').length || 0} Total Fields
                        </Badge>
                      </div>
                      <div className="flex-1 overflow-hidden">
                        {renderFieldsTable()}
                      </div>
                    </TabsContent>

                    <TabsContent value="documents" className="h-full m-0 p-8 overflow-auto">
                      <div className="mb-6">
                        <h2 className="text-xl font-bold text-slate-900">Required Assets</h2>
                        <p className="text-sm text-slate-500">Documents that will be sent as part of the automation payload.</p>
                      </div>
                      {renderDocumentsSection()}
                    </TabsContent>
                  </Tabs>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="p-6 border-t bg-white flex justify-between items-center z-20 shadow-[0_-4px_20px_-10px_rgba(0,0,0,0.1)]">
          <Button variant="ghost" className="font-bold text-slate-500 hover:bg-slate-50" onClick={onClose}>Discard Changes</Button>

          <div className="flex items-center justify-between">
            <Button
              onClick={handleRunAutomation}
              disabled={isAutomationRunning}
              className="bg-blue-600 hover:bg-blue-700 text-white h-12 px-10 rounded-xl font-bold shadow-lg shadow-blue-200 flex items-center gap-3 transition-all hover:scale-[1.02] active:scale-[0.98]"
            >
              {isAutomationRunning ? <Loader2 className="h-5 w-5 animate-spin" /> : <Zap className="h-5 w-5 fill-white" />}
              <span>{isAutomationRunning ? 'Executing...' : 'Execute Workflow'}</span>
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};