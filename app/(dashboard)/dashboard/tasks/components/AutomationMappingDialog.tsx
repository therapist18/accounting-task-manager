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
  CheckCircle2, Info, ArrowRight, Edit3, X, Save
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

        // --- FIXED LOGIC START ---
        // 1. Collect all potential Automation IDs from both global config and individual requirements
        const individualRequirements = requirement.requirements?.filter((req: any) => 
          req.automationId || req.automation_id || req.web_automation?.automationId
        ) || [];

        const globalAutoIds = requirement.web_automation?.map((auto: any) => auto.automationId).filter(Boolean) || [];
        const indivAutoIds = individualRequirements.map((req: any) => req.automationId || req.automation_id || req.web_automation?.automationId).filter(Boolean);
        
        const allAutomationIds = [...new Set([...globalAutoIds, ...indivAutoIds])];
        
        console.log('🤖 All Automation IDs found:', allAutomationIds);

        let finalWebDataItems: any[] = [];
        let fetchedAutos: any[] = [];

        if (allAutomationIds.length > 0) {
          // Fetch automation definitions including webdata
          const { data: autos } = await supabase.from('tm_automations').select('*').in('id', allAutomationIds);
          fetchedAutos = autos || [];
          console.log('✅ Fetched automations:', fetchedAutos);

          // 2. Build Unified References
          const globalRefs = requirement.web_automation || [];
          const indivRefs = individualRequirements.map((req: any) => ({
             automationId: req.automationId || req.automation_id || req.web_automation?.automationId,
             documentName: req.name, // Use requirement name as sidebar label
             documentId: req.id,
             // Inherit config
             ...(req.web_automation || {})
          }));

          const allRefs = [...globalRefs, ...indivRefs];

          // 3. Map References to Data Objects
          finalWebDataItems = allRefs.map((ref: any) => {
            const autoDef = fetchedAutos.find(a => a.id === ref.automationId);
            return {
              ...ref,
              fields: autoDef?.webdata || [],
              automationName: autoDef?.name, // Fallback name
              automation: autoDef
            };
          }).filter(item => item.automationId); // Ensure valid ID

          setWebData(finalWebDataItems);
        } else {
          console.log('ℹ️ No automation IDs found for this requirement');
          setWebData([]);
        }

        // 4. Generate Sidebar Mappings
        const mappings = finalWebDataItems.map((item, idx) => ({
          entityKey: `wd-${idx}`,
          entityName: item.documentName || item.automationName || `Flow ${idx + 1}`,
          entityType: 'webdata',
          automationId: item.automationId,
          documentId: item.documentId,
          automation: item.automation
        }));
        
        console.log('📝 Generated mappings:', mappings);
        setEntityAutomationMappings(mappings);
        
        // Auto-select first mapping if none selected
        if (mappings.length > 0) {
            // Check if current selected ID exists in new mappings, if not select first
            const exists = mappings.some(m => m.automationId === selectedAutomationId);
            if (!selectedAutomationId || !exists) {
                setSelectedAutomationId(mappings[0].automationId);
            }
        } else {
          setSelectedAutomationId('');
        }

        // 5. Fetch Job Fields
        const fieldIds = finalWebDataItems.flatMap(i => i.fields?.flatMap((f: any) => f.masterFieldIds || []) || []).filter(Boolean);
        if (fieldIds.length > 0) {
          const { data: fields } = await supabase.from('tm_job_fields').select('*').in('id', fieldIds);
          setJobFields(fields?.reduce((acc, f) => ({ ...acc, [f.id.toString()]: f }), {}) || {});
        }
        // --- FIXED LOGIC END ---

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

      // 1. Gather mapped formData
      const formData: Record<string, any> = {};
      const activeWeb = webData.find(w => w.automationId === selectedAutomationId);
      
      activeWeb?.fields?.forEach(f => {
        // Skip document type fields in form data mapping, they are handled separately or via URLs
        if (f.fieldType === 'document') return;

        const values = (f.masterFieldIds || []).map(mid => {
          const field = jobFields[mid];
          if (!field?.sources?.[0]) return null;
          const val = getSourceValue(field.sources[0].table, field.sources[0].path);
          return val === 'Missing' ? null : val;
        }).filter(Boolean);
        
        // Default to variableName mapping
        if (values.length > 0) {
            formData[f.variableName] = values.join(' ');
        }
      });

      // 2. Construct the exact Payload Structure requested
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
    
    // Filter out document fields from the main table
    const dataFields = activeWebEntry.fields.filter((f: any) => f.fieldType !== 'document');

    if (dataFields.length === 0) return <div className="p-12 text-center text-slate-400">No data fields configured (only documents).</div>;

    return (
      <div className="border rounded-xl bg-white shadow-sm overflow-hidden">
        <Table>
          <TableHeader className="bg-slate-50">
            <TableRow>
              <TableHead className="w-[300px]">WebData Field</TableHead>
              <TableHead className="w-[300px]">Source Mapping</TableHead>
              <TableHead>Current Value (Click to Edit)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {dataFields.map((field, fIdx) => {
              const masterIds = field.masterFieldIds || [];
              const sources = masterIds.map(id => {
                const f = jobFields[id];
                return f?.sources?.[0] ? { label: f.label, ...f.sources[0] } : null;
              }).filter(Boolean);

              return (
                <TableRow key={fIdx} className="group">
                  <TableCell className="align-top">
                    <div className="font-semibold text-slate-900">{field.efnsDisplayName || field.name}</div>
                    <code className="text-[10px] bg-slate-100 px-1 py-0.5 rounded text-blue-600 font-mono">{field.variableName}</code>
                    <div className="mt-1 flex gap-1">
                      <Badge variant="outline" className="text-[9px] uppercase">{field.fieldType}</Badge>
                      {field.isRequired && <Badge className="bg-red-50 text-red-600 border-red-100 text-[9px]">Required</Badge>}
                    </div>
                  </TableCell>
                  <TableCell className="align-top">
                    <div className="space-y-1.5">
                      {sources.map((s, sIdx) => (
                        <div key={sIdx} className="flex flex-col text-[11px] border-l-2 border-blue-200 pl-2 py-0.5">
                          <span className="font-medium text-slate-600 uppercase tracking-tight">{s.label}</span>
                          <span className="text-slate-400 font-mono truncate">{s.table}.{s.path}</span>
                        </div>
                      ))}
                      {sources.length === 0 && <span className="text-xs text-slate-400 italic">No master field linked</span>}
                    </div>
                  </TableCell>
                  <TableCell className="align-top">
                    <div className="space-y-2">
                      {sources.map((s, sIdx) => {
                        const val = getSourceValue(s.table, s.path);
                        const isEditing = editingCell?.fieldId === field.variableName && editingCell?.sourceIdx === sIdx;

                        return (
                          <div key={sIdx} className="relative">
                            {isEditing ? (
                              <div className="flex items-center gap-1 animate-in fade-in slide-in-from-top-1 duration-200">
                                <Input 
                                  autoFocus 
                                  value={editValue} 
                                  onChange={e => setEditValue(e.target.value)}
                                  onKeyDown={e => e.key === 'Enter' && saveEdit()}
                                  className="h-8 text-sm"
                                />
                                <Button size="sm" className="h-8 w-8 p-0 bg-green-600 hover:bg-green-700" onClick={saveEdit}>
                                  <Save className="h-3.5 w-3.5" />
                                </Button>
                                <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-slate-400" onClick={() => setEditingCell(null)}>
                                  <X className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            ) : (
                              <button
                                onClick={() => startEditing(field.variableName, sIdx, s.table, s.path, val)}
                                className={cn(
                                  "w-full text-left p-2 rounded-lg border border-dashed transition-all group/btn",
                                  val === 'Missing' ? "bg-red-50/30 border-red-200 hover:bg-red-50" : "bg-slate-50/50 border-slate-200 hover:border-blue-400 hover:bg-blue-50/30"
                                )}
                              >
                                <div className="flex justify-between items-center">
                                  <span className={cn("text-sm font-medium", val === 'Missing' ? "text-red-500 italic" : "text-slate-700")}>
                                    {val}
                                  </span>
                                  <Edit3 className="h-3 w-3 text-slate-300 opacity-0 group-hover/btn:opacity-100 transition-opacity" />
                                </div>
                              </button>
                            )}
                          </div>
                        );
                      })}
                      {sources.length > 1 && (
                        <div className="mt-2 p-2 rounded bg-purple-50 border border-purple-100 flex items-center gap-2">
                          <Info className="h-3 w-3 text-purple-500" />
                          <span className="text-[10px] text-purple-700 font-medium">Auto-merged result: <span className="underline italic">"{sources.map(s => getSourceValue(s.table, s.path)).filter(v => v !== 'Missing').join(' ')}"</span></span>
                        </div>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    );
  };

  const renderDocumentsSection = () => {
    // Collect required documents from webdata where fieldType is 'document'
    const requiredDocs = activeWebEntry?.fields?.filter((f: any) => f.fieldType === 'document') || [];
    
    // Also include generic 'kycDocsUpload' property if it exists from legacy configuration
    const legacyDocs = activeWebEntry?.kycDocsUpload || [];

    // Combine them, preferring the new field structure
    const allReqs = [...requiredDocs, ...legacyDocs.map((d: any) => ({
         kycDocumentId: d.kycDocumentId,
         efnsDisplayName: d.documentName || d.entityType,
         variableName: d.kycDocumentId
    }))];

    // Deduplicate by ID
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
                    <p className="text-[10px] text-slate-400 font-mono">ID: {req.kycDocumentId}</p>
                    {req.variableName && <p className="text-[10px] text-blue-400 font-mono">Var: {req.variableName}</p>}
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
        
        {/* HEADER BAR */}
        <div className="p-5 border-b bg-white flex items-center justify-between shadow-sm z-20">
          <div className="flex items-center gap-5">
            <div className="h-12 w-12 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-blue-200">
              <Zap className="h-6 w-6 fill-white"/>
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
             {isLoading && <Loader2 className="h-5 w-5 animate-spin text-blue-600 mx-2"/>}
          </div>
        </div>

        <div className="flex-1 flex overflow-hidden bg-slate-50/50">
          
          {/* SIDEBAR */}
          <div className="w-80 border-r bg-white flex flex-col z-10">
            <div className="p-5 pb-3">
              <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Available Flows</h3>
            </div>
            <ScrollArea className="flex-1">
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
                        <p className="text-[10px] text-slate-400 font-medium truncate uppercase tracking-tighter mt-0.5">{mapping.entityName}</p>
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
            </ScrollArea>
          </div>

          {/* MAIN CONTENT AREA */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {!selectedAutomationId ? (
              <div className="flex-1 flex flex-col items-center justify-center text-slate-300">
                <Webhook className="h-16 w-16 mb-4 opacity-10" />
                <p className="text-lg font-medium">Select a workflow from the sidebar</p>
              </div>
            ) : (
              <>
                <div className="px-8 py-4 bg-white border-b flex items-center justify-between">
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
                          <p className="text-xs font-mono">{selectedMapping?.automation?.webhook_url}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                </div>

                <div className="flex-1 overflow-auto p-8">
                  <Tabs value={activeTab} className="h-full">
                    <TabsContent value="fields" className="m-0 focus-visible:ring-0">
                      <div className="mb-6 flex items-center justify-between">
                        <div>
                          <h2 className="text-xl font-bold text-slate-900">Field Correspondence</h2>
                          <p className="text-sm text-slate-500">Mapping master database fields to the target automation schema.</p>
                        </div>
                        <Badge variant="outline" className="px-4 py-1 text-blue-600 border-blue-100 bg-blue-50/50">
                          {activeWebEntry?.fields?.filter((f: any) => f.fieldType !== 'document').length || 0} Data Fields
                        </Badge>
                      </div>
                      {renderFieldsTable()}
                    </TabsContent>
                    
                    <TabsContent value="documents" className="m-0 focus-visible:ring-0">
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

        {/* FOOTER ACTIONS */}
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