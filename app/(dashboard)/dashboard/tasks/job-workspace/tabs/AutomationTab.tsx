// @ts-nocheck
"use client"

import React, { useState, useMemo, useCallback, useEffect } from "react"
import {
  ChevronDown, ChevronRight, FileText, User, Loader2, RefreshCw,
  CheckCircle2, AlertCircle, Eye, Briefcase, UserCheck, HeartPulse, ArrowUpDown, ArrowUp, ArrowDown, Users2,
  Database, Zap, Search, Play, X, StopCircle, Terminal, Calendar, Edit3
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { resolveVariableValueImpl, resolveTargetEntityIdImpl, fetchSourceDataImpl, getArrayFieldDataImpl, getFieldValueImpl, type FieldResolutionContext } from "../../utils/fieldResolution"
import { isValidValue, cleanFieldValue, ETA_SCREENSHOT_DOCUMENT_ID } from "../../utils/AutomationMappingDialog"
import { executeComputedField } from "../../utils/automationComputedFunctions"
import type { JobWorkspaceData } from "../fetchJobWorkspaceData"
import supabase from "@/lib/supabase/client"
import { toast } from '@/lib/hooks/use-toast'

interface AutomationTabProps {
  data: JobWorkspaceData
  onRefresh?: () => void
}

interface ColDef {
  type: string
  id: number | string
  label: string
  subLabel: string
  roles?: string[]
  priority: number
}

function buildParticipantColumns(task: any): ColDef[] {
  if (!task) return []
  const cols: ColDef[] = []
  const participants = task.participants_details || []
  const applicant = task.applicant_details || {}

  let priority = 1
  if (applicant?.type === "company") {
    cols.push({ type: "company", id: applicant.id, label: applicant.name, subLabel: "Applicant", priority: priority++ })
  } else {
    const companyPart = participants.find((p: any) => p.type === "company")
    if (companyPart) cols.push({ type: "company", id: companyPart.id, label: companyPart.name, subLabel: "Entity", priority: priority++ })
  }

  if (applicant?.type === "individual") {
    const role = Array.isArray(applicant.role) ? applicant.role : [applicant.role]
    let colType = "principal"
    if (role.includes("dependant") || role.includes("dependent")) colType = "dependant"
    else if (role.includes("director") || role.includes("shareholder")) colType = "director"
    else if (role.includes("understudy")) colType = "understudy"
    cols.push({ type: colType, id: applicant.id, label: applicant.name, subLabel: colType.toUpperCase(), roles: role, priority: priority++ })
  }

  participants.filter((p: any) => p.type === "individual").forEach((p: any) => {
    const roles = Array.isArray(p.role) ? p.role : [p.role]
    if (cols.find(c => c.id === p.id)) return
    if (roles.includes("director") || roles.includes("shareholder")) {
      cols.push({ type: "director", id: p.id, label: p.name, subLabel: "Director", roles, priority: priority++ })
    } else if (roles.includes("dependant") || roles.includes("dependent")) {
      cols.push({ type: "dependant", id: p.id, label: p.name, subLabel: p.relationship || "Dependant", roles, priority: priority++ })
    } else if (roles.includes("understudy")) {
      cols.push({ type: "understudy", id: p.id, label: p.name, subLabel: "Understudy", roles, priority: priority++ })
    } else if (roles.includes("sponsor")) {
      cols.push({ type: "sponsor", id: p.id, label: p.name, subLabel: "Sponsor", roles, priority: priority++ })
    } else if (roles.includes("principal") || roles.includes("applicant")) {
      if (!cols.find(c => c.id === p.id)) cols.push({ type: "principal", id: p.id, label: p.name, subLabel: "Principal", roles, priority: priority++ })
    }
  })

  return cols.sort((a, b) => a.priority - b.priority)
}

function getEntityTypeConfig(type: string) {
  switch (type) {
    case "company": return { bgColor: "bg-slate-700", Icon: Briefcase }
    case "director": return { bgColor: "bg-indigo-600", Icon: UserCheck }
    case "dependant": return { bgColor: "bg-blue-500", Icon: Users2 }
    case "principal": return { bgColor: "bg-custom-blue", Icon: UserCheck }
    case "sponsor": return { bgColor: "bg-green-600", Icon: HeartPulse }
    case "understudy": return { bgColor: "bg-cyan-600", Icon: User }
    default: return { bgColor: "bg-custom-blue", Icon: User }
  }
}

function humanizeVariableName(name: string): string {
  if (!name) return "Field"
  return name
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

function getFieldLabel(field: any): string {
  return field?.efnsDisplayName || field?.name || humanizeVariableName(field?.variableName) || "Field"
}

function isFieldApplicable(field: any, col: ColDef): boolean {
  const entityTypes = field.entityTypes || (field.applicableTo ? [field.applicableTo] : [])
  if (!entityTypes || entityTypes.length === 0) return true

  const lowerEntityTypes = entityTypes.map(t => String(t).toLowerCase())
  const colType = String(col.type).toLowerCase()
  const colRoles = (col.roles || []).map(r => String(r).toLowerCase())

  if (lowerEntityTypes.includes('dependent') && !lowerEntityTypes.includes('dependant')) lowerEntityTypes.push('dependant')
  if (lowerEntityTypes.includes('dependant') && !lowerEntityTypes.includes('dependent')) lowerEntityTypes.push('dependent')

  if (colType === 'dependent' || colType === 'dependant') {
    if (lowerEntityTypes.includes('dependant') || lowerEntityTypes.includes('dependent')) return true
  }

  if (colType === 'principal') {
    if (lowerEntityTypes.includes('principal') || lowerEntityTypes.includes('director') || lowerEntityTypes.includes('individual')) return true
  }

  if (lowerEntityTypes.includes(colType)) return true

  for (const role of colRoles) {
    if (lowerEntityTypes.includes(role)) return true
    if (role === 'director' && lowerEntityTypes.includes('principal')) return true
    if (role === 'principal' && lowerEntityTypes.includes('director')) return true
  }

  if (colType !== 'company' && lowerEntityTypes.includes('individual')) return true

  return false
}

export function AutomationTab({ data, onRefresh }: AutomationTabProps) {
  const { task, automations } = data
  const [expandedAutomations, setExpandedAutomations] = useState<Set<number>>(new Set(automations?.map(a => a.id) || []))
  const [expandedArrayFields, setExpandedArrayFields] = useState<Set<string>>(new Set())
  const [sortCol, setSortCol] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc")

  const [fieldSourceDataCache, setFieldSourceDataCache] = useState<Record<string, Record<string, any>>>({})
  const [fieldMasterComputedCache, setFieldMasterComputedCache] = useState<Record<string, any>>({})
  const [resolvedValues, setResolvedValues] = useState<Record<string, any>>({})
  const [resolving, setResolving] = useState<Record<string, boolean>>({})
  const [jobFieldsRecord, setJobFieldsRecord] = useState<Record<string, any>>({})

  // Run automation state
  const [runningAutomationId, setRunningAutomationId] = useState<number | null>(null)
  const [automationJobId, setAutomationJobId] = useState<string | null>(null)
  const [automationProgress, setAutomationProgress] = useState<any>(null)
  const [pollingInterval, setPollingInterval] = useState<NodeJS.Timeout | null>(null)
  const [showConsole, setShowConsole] = useState(false)

  // Editing state
  const [editingCell, setEditingCell] = useState<any>(null)
  const [editValue, setEditValue] = useState('')

  // Documents & computed
  const [documentFiles, setDocumentFiles] = useState<any[]>([])
  const [computedFieldsPreview, setComputedFieldsPreview] = useState<Record<string, string>>({})
  const [isLoadingDocuments, setIsLoadingDocuments] = useState(false)
  const [isComputing, setIsComputing] = useState(false)

  // Preview state
  const [showPreviewModal, setShowPreviewModal] = useState(false)
  const [previewingDocuments, setPreviewingDocuments] = useState<any>(null)
  const [savedScreenshotDoc, setSavedScreenshotDoc] = useState<any>(null)
  const [isSavingScreenshot, setIsSavingScreenshot] = useState(false)
  const [individualName, setIndividualName] = useState<string>('')

  const logsEndRef = React.useRef<HTMLDivElement>(null)

  const columns = useMemo(() => buildParticipantColumns(task), [task])

  // Build relationship data (same as Requirements logic)
  const relationshipData = useMemo(() => {
    if (!task) return []
    const participants = task.participants_details || []
    const applicant = task.applicant_details || {}

    const companyParticipant = participants.find((p: any) => p.type === 'company')
    const isApplicantDependant = applicant.role === 'dependant' || (Array.isArray(applicant.role) && applicant.role.includes('dependant'))

    let principal = participants.find((p: any) =>
      p.type === 'individual' && (Array.isArray(p.role) ? p.role.includes('principal') : p.role === 'principal')
    )

    let dependants = participants
      .filter((p: any) => p.type === 'individual' && (Array.isArray(p.role) ? p.role.includes('dependant') : p.role === 'dependant'))
      .map((dep: any) => ({ id: dep.id, name: dep.name, relationship: dep.relationship || 'dependant' }))

    if (isApplicantDependant) {
      if (!dependants.find((d: any) => d.id === applicant.id)) {
        dependants.push({ id: applicant.id || task?.individual_id, name: applicant.name, relationship: applicant.relationship || 'dependant' })
      }
    } else {
      if (!principal) principal = { id: applicant.id || task?.individual_id, name: applicant.name, role: applicant.role }
    }

    return [{
      company: { id: companyParticipant?.id || task?.company_id, name: companyParticipant?.name || task?.company_name || 'Company', type: 'company' },
      principal: principal ? { id: principal.id, name: principal.name, role: principal.role } : null,
      directors: participants
        .filter((p: any) => p.type === 'individual' && (Array.isArray(p.role) ? (p.role.includes('director') || p.role.includes('shareholder')) : (p.role === 'director' || p.role === 'shareholder')))
        .map((d: any) => ({ id: d.id, name: d.name, role: d.role })),
      dependants: dependants,
      understudy: (() => {
        const up = participants.find((p: any) => p.type === 'individual' && (Array.isArray(p.role) ? p.role.includes('understudy') : p.role === 'understudy'))
        return up ? { id: up.id, name: up.name } : null
      })(),
      sponsor: (() => {
        const sp = participants.find((p: any) => p.type === 'individual' && (Array.isArray(p.role) ? p.role.includes('sponsor') : p.role === 'sponsor'))
        return sp ? { id: sp.id, name: sp.name } : null
      })()
    }]
  }, [task])

  // Load job fields
  useEffect(() => {
    const linkedFieldIds = new Set<string>()
      ; (automations || []).forEach(auto => {
        if (auto.webdata && auto.webdata.length > 0) {
          auto.webdata.forEach((field: any) => {
            ; (field.linkedMasterFields || field.masterFieldIds || []).forEach((id: any) => linkedFieldIds.add(String(id)))
              ; (field.arrayItems || []).forEach((item: any) => {
                ; (item.linkedMasterFields || item.masterFieldIds || (item.linkedMasterFieldId ? [item.linkedMasterFieldId] : [])).forEach((id: any) => linkedFieldIds.add(String(id)))
              })
          })
        }
      })
    if (linkedFieldIds.size === 0) return
    const fetchJobFields = async () => {
      const { data: fields } = await supabase.from('tm_job_fields').select('*').in('id', Array.from(linkedFieldIds))
      if (fields) {
        setJobFieldsRecord(fields.reduce((acc: Record<string, any>, field: any) => {
          acc[String(field.id)] = field
          return acc
        }, {}))
      }
    }
    fetchJobFields()
  }, [automations])

  // Pre-fetch source data
  useEffect(() => {
    if (expandedAutomations.size === 0 || Object.keys(jobFieldsRecord).length === 0) return
    const loadAll = async () => {
      const mergedSource: Record<string, Record<string, any>> = {}
      const mergedComputed: Record<string, any> = {}
      const calls: Promise<void>[] = []

        ; (automations || []).forEach(auto => {
          if (!expandedAutomations.has(auto.id) || !auto.webdata?.length) return
          relationshipData.forEach((relData: any) => {
            calls.push(
              fetchSourceDataImpl({
                selectedAutomationId: String(auto.id),
                webData: [{ automationId: String(auto.id), fields: auto.webdata }],
                jobFields: jobFieldsRecord,
                relationshipData: relData,
                taskId: String(task?.id || ""),
                currentIndividualId: String(task?.individual_id || ""),
                task
              }).then(({ sourceData: sd, masterFieldComputedValues: mc }) => {
                Object.entries(sd).forEach(([table, records]) => {
                  if (!mergedSource[table]) mergedSource[table] = {}
                  Object.assign(mergedSource[table], records)
                })
                if (mc) Object.assign(mergedComputed, mc)
              }).catch(err => console.error('Error resolving field values', err))
            )
          })
        })
      await Promise.all(calls)
      setFieldSourceDataCache(prev => {
        const next = { ...prev }
        Object.entries(mergedSource).forEach(([table, records]) => { next[table] = { ...(next[table] || {}), ...records } })
        return next
      })
      setFieldMasterComputedCache(prev => ({ ...prev, ...mergedComputed }))
    }
    loadAll()
  }, [expandedAutomations, automations, jobFieldsRecord, relationshipData, task])

  // Single field resolver
  const resolveFieldForCol = useCallback(async (field: any, col: ColDef) => {
    const cacheKey = `${field.variableName || field.name || field.field_name}-${col.id}`
    if (resolvedValues[cacheKey] !== undefined && !resolving[cacheKey]) return
    setResolving(prev => ({ ...prev, [cacheKey]: true }))
    try {
      const ctx = {
        sourceData: fieldSourceDataCache,
        jobFields: jobFieldsRecord,
        webData: [{ automationId: String(field.automation_id || ""), fields: [field] }],
        selectedAutomationId: String(field.automation_id || ""),
        masterFieldComputedValues: fieldMasterComputedCache,
        relationshipData: relationshipData[0],
        taskId: String(task?.id || ""),
        currentIndividualId: col.type === 'company' ? String(task?.individual_id || "") : String(col.id),
        task,
      }
      const targetEntityId = resolveTargetEntityIdImpl(field, ctx)
      const val = targetEntityId != null ? resolveVariableValueImpl(field, String(targetEntityId), ctx) : null
      setResolvedValues(prev => ({ ...prev, [cacheKey]: val }))
    } catch {
      setResolvedValues(prev => ({ ...prev, [cacheKey]: null }))
    }
    setResolving(prev => ({ ...prev, [cacheKey]: false }))
  }, [task, fieldSourceDataCache, jobFieldsRecord, fieldMasterComputedCache, relationshipData, resolvedValues, resolving])

  // Auto-resolve when source data is ready
  useEffect(() => {
    if (Object.keys(fieldSourceDataCache).length === 0) return
      ; (automations || []).forEach(auto => {
        if (!expandedAutomations.has(auto.id)) return
          ; (auto.webdata || []).forEach((field: any) => {
            columns.forEach(col => {
              const cacheKey = `${field.variableName || field.name || field.field_name}-${col.id}`
              if (resolvedValues[cacheKey] === undefined && !resolving[cacheKey] && isFieldApplicable(field, col)) {
                resolveFieldForCol(field, col)
              }
            })
          })
      })
  }, [fieldSourceDataCache, expandedAutomations, automations, columns, resolvedValues, resolving, resolveFieldForCol])

  const handleSort = (colKey: string) => {
    setSortCol(prev => prev === colKey ? (setSortDir(d => d === "asc" ? "desc" : "asc"), colKey) : (setSortDir("asc"), colKey))
  }

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

  const clearPolling = useCallback(() => {
    setPollingInterval(prev => {
      if (prev) clearInterval(prev);
      return null;
    });
  }, []);

  const saveScreenshotToSupabase = async (base64Screenshot: string, directorId: string): Promise<any> => {
    setIsSavingScreenshot(true);
    try {
      const byteCharacters = atob(base64Screenshot);
      const byteNumbers = new Array(byteCharacters.length).fill(0).map((_, i) => byteCharacters.charCodeAt(i));
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: 'image/png' });
      const timestamp = Date.now();
      const fileName = `eta - kenya - confirmation - ${timestamp}.png`;
      const storagePath = `individual - documents / ${directorId} /${ETA_SCREENSHOT_DOCUMENT_ID}/${fileName}`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('kyc-documents')
        .upload(storagePath, blob, {
          contentType: 'image/png',
          upsert: false,
        });
      if (uploadError) throw new Error(`Storage upload failed: ${uploadError.message}`);
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
            task_id: task?.id,
          },
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select()
        .single();
      if (insertError) throw new Error(`DB insert failed: ${insertError.message}`);
      return docRecord;
    } finally {
      setIsSavingScreenshot(false);
    }
  };

  const getPrimaryTargetEntityId = useCallback((): string => {
    return task?.individual_id?.toString() || task?.applicant_details?.id || '';
  }, [task]);

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
        if (onRefresh) onRefresh();

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
  }, [getPrimaryTargetEntityId, individualName, onRefresh, saveScreenshotToSupabase]);

  const pollSupabaseJob = useCallback(async (jobId: string) => {
    try {
      const { data: job, error } = await supabase
        .from('automation_jobs')
        .select('*')
        .eq('id', jobId)
        .single();

      if (error || !job) {
        clearPolling();
        setRunningAutomationId(null);
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
        setRunningAutomationId(null);
        await handleCompletedJob(job);
      } else if (job.status === 'failed') {
        clearPolling();
        setRunningAutomationId(null);
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
    }).eq('id', automationJobId);
    clearPolling();
    setRunningAutomationId(null);
    setAutomationProgress(prev => prev ? { ...prev, isRunning: false, message: 'Stopped by user' } : prev);
  }, [automationJobId, clearPolling]);

  useEffect(() => {
    return () => {
      if (pollingInterval) clearInterval(pollingInterval);
    };
  }, [pollingInterval]);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [automationProgress?.logs?.length]);

  const buildFieldResolutionContextForAuto = useCallback((automationId: string, fields: any[]): FieldResolutionContext => ({
    sourceData: fieldSourceDataCache,
    jobFields: jobFieldsRecord,
    webData: [{ automationId: String(automationId), fields }],
    selectedAutomationId: String(automationId),
    masterFieldComputedValues: fieldMasterComputedCache,
    relationshipData: relationshipData[0],
    taskId: String(task?.id || ""),
    currentIndividualId: String(task?.individual_id || ""),
    task,
  }), [fieldSourceDataCache, jobFieldsRecord, fieldMasterComputedCache, relationshipData, task]);

  const resolveTargetEntityId = useCallback((field: any) =>
    resolveTargetEntityIdImpl(field, { relationshipData: relationshipData[0], currentIndividualId: String(task?.individual_id || ""), task } as FieldResolutionContext),
    [relationshipData, task]);

  const resolveVariableValue = useCallback((fieldDef: any, targetEntityId: string) =>
    resolveVariableValueImpl(fieldDef, targetEntityId, buildFieldResolutionContextForAuto(fieldDef.automation_id || "", [fieldDef])),
    [buildFieldResolutionContextForAuto]);

  const getArrayFieldData = useCallback((field: any) =>
    getArrayFieldDataImpl(field, buildFieldResolutionContextForAuto(field.automation_id || "", [field])),
    [buildFieldResolutionContextForAuto]);

  const getEntityLabelById = useCallback((id: any) => {
    const col = columns.find(c => String(c.id) === String(id))
    return col?.label || String(id)
  }, [columns]);

  const cleanFormData = (data: Record<string, any>): Record<string, any> => {
    const cleaned: Record<string, any> = {};
    for (const [key, value] of Object.entries(data)) {
      if (value === null || value === undefined || value === '' || value === 'Missing') continue;
      if (Array.isArray(value)) {
        const cleanedArray = value
          .map(item => {
            if (typeof item === 'object' && item !== null) {
              const cleanedItem: Record<string, any> = {};
              let hasMeaningfulData = false;
              for (const [itemKey, itemValue] of Object.entries(item)) {
                if (['entityId', 'index', 'id'].includes(itemKey)) { cleanedItem[itemKey] = itemValue; continue; }
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
        if (cleanedArray.length > 0) cleaned[key] = cleanedArray;
      } else if (typeof value === 'object' && value !== null) {
        const cleanedObj: Record<string, any> = {};
        let hasMeaningfulData = false;
        for (const [objKey, objValue] of Object.entries(value)) {
          if (['entityId', 'index', 'id'].includes(objKey)) { cleanedObj[objKey] = objValue; continue; }
          if (objValue !== null && objValue !== undefined && objValue !== '' && objValue !== 'Missing') {
            cleanedObj[objKey] = objValue;
            hasMeaningfulData = true;
          }
        }
        if (hasMeaningfulData) cleaned[key] = cleanedObj;
      } else {
        cleaned[key] = value;
      }
    }
    return cleaned;
  };

  const handleRunAutomation = useCallback(async (automation: any) => {
    const automationId = automation.id;
    if (!automationId) { toast({ title: "Validation Error", description: "Missing automation selection", variant: "destructive" }); return; }

    setRunningAutomationId(automationId);
    setShowConsole(true);
    setAutomationProgress({
      isRunning: true,
      progress: 0,
      currentStep: 'Preparing',
      message: 'Collecting form data...',
      logs: [{ level: 'info', message: 'Starting automation...', timestamp: new Date().toISOString() }],
    });

    try {
      const automationLogin = automation.login || {};
      const fields = automation.webdata || [];
      const formData: Record<string, any> = {};

      const currentTargetId = String(task?.individual_id || "");

      for (const f of fields) {
        const targetId = resolveTargetEntityId(f) || currentTargetId;
        if (f.fieldType === 'array') {
          formData[f.variableName] = getArrayFieldData(f);
        } else if (f.fieldType === 'document') {
          const doc = documentFiles.find(d =>
            f.linkedKycDocuments?.includes(d.document_id) &&
            String(d.owner_id) === String(targetId)
          );
          const fileUrl = doc?.file_path?.startsWith('http') ? doc.file_path : getFileUrl(doc?.file_path || '');
          formData[f.variableName] = fileUrl || null;
        } else if (f.fieldType === 'computed') {
          formData[f.variableName] = computedFieldsPreview[f.variableName];
        } else {
          const cacheKey = `${f.variableName || f.name || f.field_name}-${targetId}`;
          const val = resolvedValues[cacheKey] || resolveVariableValue(f, targetId);
          formData[f.variableName] = val === "Missing" ? null : cleanFieldValue(val);
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
        formData: cleanFormData(formData),
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
        logs: [{ level: 'info', message: `Job ${job.id} queued, waiting for agent...`, timestamp: new Date().toISOString() }],
      });

      const interval = setInterval(() => {
        pollSupabaseJob(job.id);
      }, 2000);
      setPollingInterval(interval);

      toast({
        title: 'Automation Queued',
        description: `Job submitted for ${automation.name || jobType}.`,
      });

    } catch (e) {
      console.error("Automation Error:", e);
      toast({ title: 'Automation Error', description: e.message || 'Unknown error', variant: 'destructive' });
      setRunningAutomationId(null);
    }
  }, [task, resolveTargetEntityId, getArrayFieldData, documentFiles, computedFieldsPreview, resolvedValues, resolveVariableValue, cleanFormData, deriveAutomationType, pollSupabaseJob]);

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
    if (!supabaseUrl) return '';
    const encodedPath = encodeURIComponent(fullPath).replace(/%2F/g, '/');
    return `${supabaseUrl}/storage/v1/object/public/${encodedPath}`;
  };

  const startEditing = async (field: any, col: ColDef, currentVal: any) => {
    setEditingCell({ field, col, currentVal });
    setEditValue(currentVal !== null && currentVal !== undefined && currentVal !== 'Missing' ? String(currentVal) : '');
  };

  const cancelEditing = () => { setEditingCell(null); setEditValue(''); };

  const saveEdit = async () => {
    if (!editingCell) return;
    const { col } = editingCell;
    const cacheKey = `${editingCell.field.variableName || editingCell.field.name || editingCell.field.field_name}-${col.id}`;
    setResolvedValues(prev => ({ ...prev, [cacheKey]: editValue }));
    setEditingCell(null);
    setEditValue('');
    toast({ title: 'Overridden', description: 'Value saved locally.' });
  };

  useEffect(() => {
    const fetchIndividualName = async () => {
      const indId = task?.individual_id;
      if (!indId) return;
      const relData = relationshipData[0];
      if (relData?.principal?.full_name) { setIndividualName(relData.principal.full_name); return; }
      try {
        const { data: individual } = await supabase.from('registry_individuals').select('full_name').eq('id', indId).single();
        if (individual) setIndividualName(individual.full_name);
      } catch (error) { console.error('Error fetching individual name:', error); }
    };
    fetchIndividualName();
  }, [task?.individual_id, relationshipData]);

  // Auto-compute computed fields
  useEffect(() => {
    if (!task?.individual_id) return;
    const runComputation = async () => {
      const computedConfigs: any[] = [];
      (automations || []).forEach(auto => {
        (auto.webdata || []).forEach((f: any) => {
          if (f.fieldType === 'computed') computedConfigs.push(f);
        });
      });
      if (computedConfigs.length === 0) { setComputedFieldsPreview({}); return; }
      setIsComputing(true);
      try {
        const results: Record<string, any> = {};
        const cid = relationshipData[0]?.company?.id || task?.company_id;
        for (const config of computedConfigs) {
          const val = await executeComputedField(
            config.computedFunction, String(task.individual_id),
            config.computedDocuments || [], null, 'latest', null,
            config.computed_config, cid, config.entityTypes?.[0]
          );
          results[config.variableName] = val;
        }
        setComputedFieldsPreview(results);
      } catch (error) { console.error('Error auto-computing fields:', error); } finally { setIsComputing(false); }
    };
    const timer = setTimeout(runComputation, 500);
    return () => clearTimeout(timer);
  }, [task?.individual_id, automations, relationshipData, task]);

  // Fetch documents when needed
  useEffect(() => {
    if (!showConsole || !automationJobId) return;
    const loadDocs = async () => {
      setIsLoadingDocuments(true);
      try {
        const reqKycIds = new Set<string>();
        const personIds = new Set<string>();
        (automations || []).forEach(auto => {
          if (auto.id !== runningAutomationId) return;
          (auto.webdata || []).forEach((f: any) => {
            if (f.fieldType === 'document' && f.linkedKycDocuments) {
              f.linkedKycDocuments.forEach((docId: string) => reqKycIds.add(docId));
              const targetId = resolveTargetEntityId(f) || String(task?.individual_id || "");
              personIds.add(targetId);
            }
          });
        });
        if (personIds.size > 0 && reqKycIds.size > 0) {
          const { data: docs } = await supabase.from('acc_portal_directors_documents')
            .select('*, kyc_document:acc_portal_kyc!document_id(*)')
            .in('director_id', Array.from(personIds))
            .in('document_id', Array.from(reqKycIds))
            .neq('status', 'deleted');
          if (docs) setDocumentFiles(docs.map(d => ({ ...d, owner_type: 'person', owner_id: String(d.director_id) })));
        }
      } catch (err) { console.error('Error fetching documents:', err); } finally { setIsLoadingDocuments(false); }
    };
    loadDocs();
  }, [showConsole, automationJobId, automations, runningAutomationId, task, resolveTargetEntityId]);

  const totalCols = columns.length + 2

  return (
    <div className="h-full flex flex-col overflow-hidden bg-white px-6 py-4">
      {/* Header Bar */}
      <div className="flex items-center justify-between border-b pb-4 mb-3 bg-white shrink-0 z-40">
        <div className="flex items-center gap-4">
          <h3 className="text-xl font-medium text-slate-800 tracking-tight">Field Resolution Matrix</h3>
          <Badge className="bg-purple-50 text-purple-700 border-purple-200 text-sm rounded-full px-3 py-0.5">
            {automations?.length || 0} Automations
          </Badge>
        </div>
        <div className="flex items-center gap-3">
          {automationJobId && showConsole && (
            <Button variant="outline" className="h-10 px-5 text-sm font-semibold rounded-full border-slate-300 text-slate-700 bg-slate-50 hover:bg-slate-100 shadow-sm" onClick={() => setShowConsole(!showConsole)}>
              <Terminal className="h-4 w-4 mr-2" /> {showConsole ? 'Hide Console' : 'Show Console'}
            </Button>
          )}
          <Button variant="outline" className="h-10 px-5 text-sm font-medium rounded-full border-slate-300 text-slate-700 hover:bg-slate-50 shadow-sm" onClick={onRefresh}>
            <RefreshCw className="h-4 w-4 mr-2" /> Refresh
          </Button>
        </div>
      </div>

      {(!automations || automations.length === 0) ? (
        <div className="flex-1 flex flex-col items-center justify-center p-12 text-center bg-slate-50/50 rounded-lg border-2 border-dashed border-slate-200">
          <div className="bg-white p-6 rounded-full shadow-md mb-4 border border-slate-100">
            <Search className="h-10 w-10 text-slate-300" />
          </div>
          <p className="text-lg font-medium text-slate-600">No Automations Configured</p>
          <p className="text-sm font-medium text-slate-400 mt-2 max-w-sm leading-relaxed">
            This task does not have any web automation fields configured for mapping.
          </p>
        </div>
      ) : (
        <div className="flex-1 overflow-auto relative custom-scrollbar border rounded-lg bg-white shadow-sm">
          <Table className="border-separate border-spacing-0 min-w-full">
            <TableHeader className="sticky top-0 z-30 text-white">
              <TableRow className="bg-custom-blue hover:bg-custom-blue">
                <TableHead className="w-12 border-b border-r sticky left-0 top-0 bg-custom-blue z-40 p-0 text-white shadow-sm">
                  <div className="flex items-center justify-center h-full text-sm font-medium uppercase tracking-wider">#</div>
                </TableHead>
                <TableHead className="w-[300px] border-b border-r sticky left-12 top-0 bg-custom-blue z-40 p-0 text-white shadow-sm">
                  <div className="flex items-center h-full px-6 text-[11px] font-medium uppercase tracking-wider cursor-pointer hover:bg-blue-700 transition-colors" onClick={() => handleSort("field-name")}>
                    Field Name & Type
                    {sortCol === "field-name" && (sortDir === "asc" ? <ArrowUp className="ml-2 h-4 w-4" /> : <ArrowDown className="ml-2 h-4 w-4" />)}
                  </div>
                </TableHead>
                {columns.map(col => {
                  const { bgColor, Icon } = getEntityTypeConfig(col.type)
                  return (
                    <TableHead key={col.id} className={cn("min-w-[340px] border-b border-r top-0 p-0 text-white align-top shadow-sm", bgColor)}>
                      <div className="flex flex-col h-full w-full">
                        <div className="flex flex-col items-center justify-center gap-1.5 p-4 border-b border-white/20 flex-1">
                          <span className={cn("flex items-center gap-2 text-[11px] font-semibold tracking-wide")}>
                            <Icon className="h-4 w-4 opacity-90" />
                            <span className="truncate max-w-[200px]">{col.label}</span>
                          </span>
                          <span className="text-[10px] font-medium uppercase tracking-wide opacity-80">{col.subLabel}</span>
                        </div>
                        <div className="text-[10px] uppercase font-semibold tracking-wider bg-black/20 shrink-0 px-4 py-2.5 text-center">Action</div>
                      </div>
                    </TableHead>
                  )
                })}
              </TableRow>
            </TableHeader>
            <TableBody>
              {automations.map((automation: any) => {
                const isExpanded = expandedAutomations.has(automation.id)
                const fields = automation.webdata || []
                const isRunning = runningAutomationId === automation.id

                return (
                  <React.Fragment key={automation.id}>
                    {/* Automation Header Row */}
                    <TableRow
                      className={cn(
                        "hover:bg-slate-200/90 cursor-pointer transition-colors",
                        isRunning ? "bg-purple-50/90 shadow-[inset_0_0_0_1px_rgba(147,51,234,0.1)]" : "bg-slate-100/90"
                      )}
                      onClick={() => setExpandedAutomations(prev => {
                        const next = new Set(prev)
                        if (next.has(automation.id)) next.delete(automation.id)
                        else next.add(automation.id)
                        return next
                      })}
                    >
                      <TableCell colSpan={totalCols} className="py-3 px-5 border-b border-slate-300 sticky left-0 z-20">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            {isExpanded ? <ChevronDown className="h-5 w-5 text-slate-500" /> : <ChevronRight className="h-5 w-5 text-slate-500" />}
                            <div className={cn("p-1.5 rounded-md", isRunning ? "bg-purple-100 text-purple-600" : "bg-slate-200 text-slate-600")}>
                              {isRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                            </div>
                            <span className="text-[11px] font-medium uppercase tracking-wide text-slate-800">
                              {automation.name || `Automation #${automation.id}`}
                            </span>
                            <Badge variant="outline" className="text-[10px] font-semibold rounded-full px-3 py-0.5 bg-white border-slate-300 text-slate-600 shadow-sm">
                              {fields.length} Fields
                            </Badge>
                            {isRunning && (
                              <Badge className="bg-purple-100 text-purple-700 border-purple-200 text-[10px] rounded-full animate-pulse px-3 py-0.5">
                                Agent Active
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-3 pr-2">
                            {isRunning ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-9 px-5 text-xs font-medium text-red-600 hover:bg-red-50 hover:text-red-700 rounded-full border border-red-100"
                                onClick={(e) => { e.stopPropagation(); stopAutomation(); }}
                              >
                                <StopCircle className="h-4 w-4 mr-2" /> Stop Agent
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                className="h-9 px-6 text-xs font-medium bg-custom-blue hover:bg-blue-700 rounded-full shadow-md transition-all active:scale-95"
                                onClick={(e) => { e.stopPropagation(); handleRunAutomation(automation); }}
                              >
                                <Play className="h-4 w-4 mr-2" /> Run Automation
                              </Button>
                            )}
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>

                    {/* Field Rows */}
                    {isExpanded && fields.map((field: any, fIdx: number) => {
                      const isDocument = field.fieldType === 'document'
                      const isComputed = field.fieldType === 'computed'
                      const isArray = field.fieldType === 'array'
                      const fieldKey = field.variableName || field.name || field.field_name
                      const arrayExpandKey = `${automation.id}-${fieldKey}`
                      const isArrayExpanded = isArray && expandedArrayFields.has(arrayExpandKey)
                      const arrayRows = isArrayExpanded ? getArrayFieldData(field) : []

                      return (
                      <React.Fragment key={field.id || fIdx}>
                        <TableRow className="group hover:bg-slate-50/70 transition-colors">
                          <TableCell className="w-12 py-0 px-0 text-center text-xs font-mono text-slate-400 border-b border-r sticky left-0 bg-white group-hover:bg-slate-50 z-10 align-middle">
                            <div className="flex items-center justify-center h-full font-medium">{fIdx + 1}</div>
                          </TableCell>

                          <TableCell className="w-[400px] py-0 px-5 border-b border-r sticky left-12 bg-white group-hover:bg-slate-50 z-10 align-middle">
                            <div className="flex gap-2 h-full justify-between py-3">
                              <div className="flex items-center gap-2">
                                {isArray && (
                                  <button
                                    className="p-1 bg-slate-100 hover:bg-slate-200 rounded-full transition-colors shrink-0 border border-slate-200"
                                    onClick={() => setExpandedArrayFields(prev => {
                                      const next = new Set(prev)
                                      if (next.has(arrayExpandKey)) next.delete(arrayExpandKey)
                                      else next.add(arrayExpandKey)
                                      return next
                                    })}
                                    title="Expand array data"
                                  >
                                    {isArrayExpanded ? <ChevronDown className="h-3.5 w-3.5 text-slate-600" /> : <ChevronRight className="h-3.5 w-3.5 text-slate-600" />}
                                  </button>
                                )}
                                <span className="text-[11px] font-semibold text-slate-800 line-clamp-2 leading-tight">
                                  {getFieldLabel(field)}
                                </span>
                              </div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <Badge variant="secondary" className="text-[9px] font-medium uppercase tracking-wider rounded-full px-2 py-0">
                                  {field.fieldType || 'text'}
                                </Badge>
                              </div>
                            </div>
                          </TableCell>

                          {columns.map(col => {
                            const applicable = isFieldApplicable(field, col)
                            const cacheKey = `${field.variableName || field.name || field.field_name}-${col.id}`
                            const val = resolvedValues[cacheKey]
                            const isResolving = resolving[cacheKey]
                            const isMissing = !isValidValue(val)
                            const isEditing = editingCell?.field?.variableName === (field.variableName || field.name || field.field_name) && editingCell?.col?.id === col.id

                            return (
                              <TableCell key={col.id} className="p-0 border-b border-r align-middle bg-white group-hover:bg-slate-50/70 transition-colors">
                                {!applicable ? (
                                  <div className="flex h-full items-center justify-center p-3">
                                    <span className="text-[10px] font-medium text-slate-400 bg-slate-100 rounded-full px-4 py-1.5 uppercase tracking-wide italic border border-slate-200">N/A</span>
                                  </div>
                                ) : (
                                  <div className="flex items-center justify-center h-full px-3">
                                    {isResolving ? (
                                      <Loader2 className="h-5 w-5 animate-spin text-purple-500" />
                                    ) : isDocument ? (
                                      <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 border border-blue-200 shadow-sm text-blue-600">
                                        <Database className="h-3 w-3" />
                                        <span className="text-[9px] font-semibold uppercase tracking-wider">Storage</span>
                                      </div>
                                    ) : isComputed ? (
                                      <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 border border-amber-200 shadow-sm text-amber-600">
                                        <Zap className="h-3 w-3" />
                                        <span className="text-[9px] font-semibold uppercase tracking-wider">Logic</span>
                                      </div>
                                    ) : isArray ? (
                                      <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-50 border border-indigo-200 shadow-sm text-indigo-600">
                                        <Database className="h-3 w-3" />
                                        <span className="text-[9px] font-semibold uppercase tracking-wider">Array</span>
                                      </div>
                                    ) : val !== undefined ? (
                                      isMissing ? (
                                        <div className="flex gap-1.5 items-center justify-between w-full">
                                          <div className="text-sm font-semibold text-white bg-red-500 px-2.5 py-1 shadow-sm max-w-[140px] truncate">Missing</div>
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-7 px-4 text-[10px] font-semibold text-slate-600 bg-slate-50 hover:bg-slate-100 rounded-full border border-slate-200 transition-all"
                                            onClick={() => startEditing(field, col, val)}
                                          >
                                            <Edit3 className="h-3.5 w-3.5 mr-1.5" /> Edit
                                          </Button>
                                        </div>
                                      ) : (
                                        <div className="flex gap-1.5 items-center justify-between w-full">
                                          <div className="text-sm font-semibold text-slate-800 bg-white px-2.5 py-1 shadow-sm max-w-[140px] truncate">{String(cleanFieldValue(val))}</div>
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-7 px-4 text-[10px] font-semibold text-slate-600 bg-slate-50 hover:bg-slate-100 rounded-full border border-slate-200 transition-all"
                                            onClick={() => startEditing(field, col, val)}
                                          >
                                            <Edit3 className="h-3.5 w-3.5 mr-1.5" /> Edit
                                          </Button>
                                        </div>
                                      )
                                    ) : val === undefined && applicable ? (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-8 px-5 text-sm font-semibold text-purple-600 bg-purple-50 hover:bg-purple-100 rounded-full border border-purple-100"
                                        onClick={() => resolveFieldForCol(field, col)}
                                      >
                                        <Eye className="h-4 w-4 mr-1.5" /> Resolve
                                      </Button>
                                    ) : null}
                                  </div>
                                )}
                              </TableCell>
                            )
                          })}
                        </TableRow>

                        {/* Array Field Data */}
                        {isArray && isArrayExpanded && (
                          <TableRow className="bg-indigo-50/30">
                            <TableCell colSpan={totalCols} className="p-0 border-b">
                              <div className="p-4">
                                {arrayRows.length === 0 ? (
                                  <p className="text-sm text-slate-400 italic px-2">No array data resolved for this field.</p>
                                ) : (
                                  <div className="border rounded-lg overflow-hidden bg-white">
                                    <table className="w-full text-sm">
                                      <thead className="bg-slate-50">
                                        <tr>
                                          <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase text-slate-500">Entity</th>
                                          {(field.arrayItems || []).map((item: any) => (
                                            <th key={item.variableName} className="px-3 py-2 text-left text-[10px] font-semibold uppercase text-slate-500">
                                              {getFieldLabel(item)}
                                            </th>
                                          ))}
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {arrayRows.map((row: any, rIdx: number) => (
                                          <tr key={rIdx} className="border-t">
                                            <td className="px-3 py-2 text-xs font-medium text-slate-600">{getEntityLabelById(row.entityId)}</td>
                                            {(field.arrayItems || []).map((item: any) => (
                                              <td key={item.variableName} className="px-3 py-2 text-xs text-slate-700">
                                                {row[item.variableName] ?? '-'}
                                              </td>
                                            ))}
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </React.Fragment>
                      )
                    })}

                    {/* Automation Logs Section */}
                    {isRunning && showConsole && (
                      <TableRow className="bg-slate-900 border-y-0">
                        <TableCell colSpan={totalCols} className="p-0 border-b-0">
                          <div className="flex flex-col w-full">
                            <div className="bg-black/40 border-y border-white/5 px-6 py-2 flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <Terminal className="h-4 w-4 text-green-500" />
                                <span className="text-[10px] font-medium uppercase tracking-wide text-slate-400">Execution Console</span>
                                <div className="flex items-center gap-1.5 ml-4">
                                  <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                                  <span className="text-[10px] font-medium text-green-500">{automationProgress?.status || 'RUNNING'}</span>
                                </div>
                              </div>
                              <div className="flex items-center gap-4">
                                <div className="flex flex-col items-end">
                                  <span className="text-[9px] font-medium text-slate-500 uppercase">Progress</span>
                                  <span className="text-xs font-mono font-medium text-white leading-none">{automationProgress?.progress || 0}%</span>
                                </div>
                                <div className="w-32 h-1.5 bg-white/10 rounded-full overflow-hidden border border-white/5">
                                  <div className="h-full bg-green-500 transition-all duration-500" style={{ width: `${automationProgress?.progress || 0}%` }} />
                                </div>
                              </div>
                            </div>
                            <div className="p-6 font-mono text-sm leading-relaxed max-h-[300px] overflow-y-auto custom-scrollbar-dark selection:bg-green-500/30 selection:text-white">
                              {automationProgress?.logs?.map((log: any, i: number) => (
                                <div key={i} className="flex gap-4 group/log mb-1">
                                  <span className="text-slate-600 select-none opacity-50 font-medium shrink-0">
                                    {log.timestamp ? new Date(log.timestamp).toLocaleTimeString([], { hour12: false }) : '—'}
                                  </span>
                                  <span className={cn(
                                    "flex-1 break-words font-medium",
                                    log.level === 'error' ? 'text-red-400' :
                                      log.level === 'warn' ? 'text-amber-300' :
                                        log.level === 'success' ? 'text-green-400 font-medium' :
                                          log.level === 'info' ? 'text-blue-300' : 'text-slate-300'
                                  )}>
                                    <span className="text-white/20 mr-2">❯</span>
                                    {log.message}
                                  </span>
                                </div>
                              ))}
                              {(!automationProgress?.logs || automationProgress.logs.length === 0) && (
                                <div className="text-slate-500 italic py-4 flex items-center justify-center gap-3">
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                  <span>Initializing secure connection to agent...</span>
                                </div>
                              )}
                              <div ref={logsEndRef} />
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Screenshot Preview Modal */}
      <Dialog open={showPreviewModal} onOpenChange={setShowPreviewModal}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0 overflow-hidden rounded-xl border-none shadow-2xl">
          <DialogHeader className="p-6 bg-white border-b sticky top-0 z-10">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-50 text-green-600 rounded-lg">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <div>
                <DialogTitle className="text-lg font-medium text-slate-800 leading-none">
                  {previewingDocuments?.document_display_name || 'Automation Result'}
                </DialogTitle>
                <p className="text-sm font-medium text-slate-400 uppercase tracking-wide mt-1">Proof of Execution</p>
              </div>
            </div>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50">
            {previewingDocuments?.documents?.map((doc: any, idx: number) => {
              const fileUrl = getFileUrl(doc.file_path);
              return (
                <div key={idx} className="bg-white border rounded-xl overflow-hidden shadow-sm">
                  <div className="px-4 py-3 bg-white border-b flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-slate-400" />
                      <span className="text-xs font-medium text-slate-600 truncate max-w-[400px]">{doc.file_name}</span>
                    </div>
                    {fileUrl && (
                      <Button asChild variant="outline" size="sm" className="h-7 text-[10px] font-medium rounded-full">
                        <a href={fileUrl} target="_blank" rel="noopener noreferrer">View Full Size</a>
                      </Button>
                    )}
                  </div>
                  {fileUrl && (
                    <div className="p-4 bg-slate-900 flex items-center justify-center min-h-[300px]">
                      <img src={fileUrl} alt="Automation Evidence" className="max-w-full h-auto shadow-2xl rounded border border-white/10" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="p-4 bg-white border-t flex justify-end">
            <Button className="rounded-full px-6 font-medium bg-custom-blue" onClick={() => setShowPreviewModal(false)}>Close Preview</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}