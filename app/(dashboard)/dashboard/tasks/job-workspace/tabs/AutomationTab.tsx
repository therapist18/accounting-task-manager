// @ts-nocheck
"use client"

import React, { useState, useMemo, useCallback, useEffect } from "react"
import {
  ChevronDown, ChevronRight, FileText, User, Loader2, RefreshCw,
  CheckCircle2, AlertCircle, Eye, Briefcase, UserCheck, HeartPulse, ArrowUpDown, ArrowUp, ArrowDown, Users2,
  Database, Zap, Search, Play, X, StopCircle, Terminal
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
    case "principal": return { bgColor: "bg-blue-700", Icon: UserCheck }
    case "sponsor": return { bgColor: "bg-green-600", Icon: HeartPulse }
    case "understudy": return { bgColor: "bg-cyan-600", Icon: User }
    default: return { bgColor: "bg-blue-600", Icon: User }
  }
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
    ;(automations || []).forEach(auto => {
      if (auto.webdata && auto.webdata.length > 0) {
        auto.webdata.forEach((field: any) => {
          ;(field.linkedMasterFields || field.masterFieldIds || []).forEach((id: any) => linkedFieldIds.add(String(id)))
          ;(field.arrayItems || []).forEach((item: any) => {
            ;(item.linkedMasterFields || item.masterFieldIds || (item.linkedMasterFieldId ? [item.linkedMasterFieldId] : [])).forEach((id: any) => linkedFieldIds.add(String(id)))
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

      ;(automations || []).forEach(auto => {
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
    const cacheKey = `${field.variableName || field.name}-${col.id}`
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
    ;(automations || []).forEach(auto => {
      if (!expandedAutomations.has(auto.id)) return
      ;(auto.webdata || []).forEach((field: any) => {
        columns.forEach(col => {
          const cacheKey = `${field.variableName || field.name}-${col.id}`
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

  // ---- New functions from AutomationMappingDialog ----

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
      console.log('✅ Screenshot saved to Supabase:', docRecord);
      return docRecord;
    } finally {
      setIsSavingScreenshot(false);
    }
  };

  const getPrimaryEntityType = useCallback(() => {
    return 'principal';
  }, []);

  const getPrimaryTargetEntityId = useCallback((): string => {
    return task?.individual_id?.toString() || task?.applicant_details?.id || '';
  }, [task]);

  const getEntityNameAndId = useCallback((entityType?: string, entityId?: string) => {
    const targetId = entityId;
    if (!entityType && !targetId) return { name: 'Not specified', id: 'Not specified' };
    const relData = relationshipData[0];
    const type = entityType?.toLowerCase();
    if (type === 'company') {
      return {
        name: relData?.company?.company_name || task?.company_name || 'Not specified',
        id: String(relData?.company?.id || task?.company_id || 'Not specified')
      };
    }
    const allPeople = [
      ...(relData?.directors || []),
      ...(relData?.dependants || []),
      relData?.understudy,
      relData?.sponsor,
      relData?.principal
    ].filter(Boolean);
    const person = allPeople.find(p => String(p.id) === String(targetId));
    if (person) {
      return {
        name: person.full_name || person.name || (person.first_name ? `${person.first_name} ${person.last_name || ''}` : 'Not specified'),
        id: String(person.id)
      };
    }
    return { name: 'Not specified', id: 'Not specified' };
  }, [relationshipData, task]);

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
        console.log('Job not found - stopping polling');
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
      if (pollingInterval) {
        clearInterval(pollingInterval);
      }
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

  const getFieldValue = useCallback((fieldIdOrVariable: string, entityId: string, sourceIdx: number = 0, extractionMode: string = 'latest', preserveArray: boolean = false) =>
    getFieldValueImpl(fieldIdOrVariable, entityId, sourceIdx, extractionMode, preserveArray, buildFieldResolutionContextForAuto("", [])),
    [buildFieldResolutionContextForAuto]);

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

      const ctx = buildFieldResolutionContextForAuto(String(automationId), fields);
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
          const val = resolveVariableValue(f, targetId);
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
        description: `Job submitted for ${automation.name || jobType}. The agent will pick it up shortly.`,
      });

    } catch (e) {
      console.error("Automation Error:", e);
      toast({ title: 'Automation Error', description: e.message || 'Unknown error', variant: 'destructive' });
      setRunningAutomationId(null);
    }
  }, [task, buildFieldResolutionContextForAuto, resolveTargetEntityId, getArrayFieldData, documentFiles, computedFieldsPreview, resolveVariableValue, cleanFormData, deriveAutomationType, pollSupabaseJob]);

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
    if (!supabaseUrl) { console.error('NEXT_PUBLIC_SUPABASE_URL not set'); return ''; }
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
    const { col, currentVal } = editingCell;
    const cacheKey = `${editingCell.field.variableName || editingCell.field.name}-${col.id}`;
    setResolvedValues(prev => ({ ...prev, [cacheKey]: editValue }));
    setEditingCell(null);
    setEditValue('');
    toast({ title: 'Overridden', description: 'Value saved locally. It will be used for the next run.', variant: 'default' });
  };

  const handlePreviewDocument = (doc: any) => {
    if (!doc) return;
    setPreviewingDocuments({
      document_display_name: doc.file_name || 'Document',
      documents: [doc],
      person_full_name: individualName || 'Unknown',
      requirementId: doc.requirement_id || 'Unknown'
    });
    setShowPreviewModal(true);
  };

  useEffect(() => {
    const fetchIndividualName = async () => {
      const indId = task?.individual_id;
      if (!indId) return;
      const relData = relationshipData[0];
      if (relData?.principal?.full_name) { setIndividualName(relData.principal.full_name); return; }
      try {
        const { data: individual } = await supabase.from('registry_individuals').select('first_name, last_name, full_name').eq('id', indId).single();
        if (individual) {
          setIndividualName(individual.full_name || `${individual.first_name || ''} ${individual.last_name || ''}`);
        }
      } catch (error) {
        console.error('Error fetching individual name:', error);
      }
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

  // Fetch documents when automation is expanded
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
      } catch (err) {
        console.error('Error fetching documents:', err);
      } finally {
        setIsLoadingDocuments(false);
      }
    };
    loadDocs();
  }, [showConsole, automationJobId, automations, runningAutomationId, task, resolveTargetEntityId]);

  if (!task) return null

  return (
    <div className="h-full flex flex-col overflow-hidden bg-white">
      {/* Header Bar */}
      <div className="flex items-center justify-between px-6 py-3 border-b bg-white shrink-0 z-40">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-bold text-slate-800">Field Resolution Matrix</h3>
          <Badge className="bg-purple-50 text-purple-700 border-purple-200 text-[10px]">
            {automations?.length || 0} Automations
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          {automationJobId && showConsole && (
            <Button variant="outline" size="sm" className="h-8 text-xs border-slate-200 text-slate-600 hover:bg-slate-50" onClick={() => setShowConsole(!showConsole)}>
              <Terminal className="h-3.5 w-3.5 mr-1.5" /> {showConsole ? 'Hide Console' : 'Show Console'}
            </Button>
          )}
          <Button variant="outline" size="sm" className="h-8 text-xs border-slate-200 text-slate-600 hover:bg-slate-50" onClick={onRefresh}>
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Refresh
          </Button>
        </div>
      </div>

      {(!automations || automations.length === 0) ? (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-slate-50/50">
          <div className="bg-white p-4 rounded-full shadow-sm mb-3 border border-slate-100">
            <Search className="h-8 w-8 text-slate-300" />
          </div>
          <p className="text-sm font-bold text-slate-600">No Automations Configured</p>
          <p className="text-[11px] font-medium text-slate-400 mt-1 max-w-xs">
            This task does not have any web automation fields configured for mapping.
          </p>
        </div>
      ) : (
        <div className="flex-1 overflow-auto relative custom-scrollbar">
          <Table className="border-separate border-spacing-0 min-w-full">
            <TableHeader className="sticky top-0 z-30">
              <TableRow className="bg-slate-50 hover:bg-slate-50">
                <TableHead className="w-12 h-12 text-center border-b border-r sticky left-0 top-0 bg-slate-50 z-40 text-[10px] font-bold uppercase text-slate-500">#</TableHead>
                <TableHead
                  className="min-w-[280px] h-12 border-b border-r sticky left-12 top-0 bg-slate-50 z-40 text-[10px] font-bold uppercase text-slate-500 cursor-pointer hover:bg-slate-100 transition-colors"
                  onClick={() => handleSort("field-name")}
                >
                  <div className="flex items-center justify-between">
                    <span>Field Name & Type</span>
                    {sortCol === "field-name" ? (sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-30" />}
                  </div>
                </TableHead>
                {columns.map(col => {
                  const { bgColor, Icon } = getEntityTypeConfig(col.type)
                  const colKey = `col-${col.id}`
                  return (
                    <TableHead
                      key={col.id}
                      className="min-w-[180px] h-12 border-b border-r top-0 bg-slate-50 p-0 cursor-pointer hover:bg-slate-100 transition-colors"
                      onClick={() => handleSort(colKey)}
                    >
                      <div className="flex flex-col items-center justify-center gap-1 px-4">
                        <div className={cn("flex items-center gap-1.5 px-2 py-0.5 rounded text-white text-[10px] font-bold shadow-sm", bgColor)}>
                          <Icon className="h-3 w-3" />
                          <span className="truncate max-w-[100px]">{col.label}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">{col.subLabel}</span>
                          {sortCol === colKey ? (sortDir === "asc" ? <ArrowUp className="h-2.5 w-2.5 text-slate-400" /> : <ArrowDown className="h-2.5 w-2.5 text-slate-400" />) : null}
                        </div>
                      </div>
                    </TableHead>
                  )
                })}
              </TableRow>
            </TableHeader>
            <TableBody>
              {automations.map((automation: any) => {
                const isExpanded = expandedAutomations.has(automation.id)
                const fields = automation.webdata || automation.fields || automation.web_data_fields || automation.mapped_fields || []
                const isRunning = runningAutomationId === automation.id

                // Sorting logic
                let sortedFields = [...fields]
                if (sortCol === "field-name") {
                  sortedFields.sort((a, b) => {
                    const aName = (a.efnsDisplayName || a.name || a.field_name || a.variableName || "").toLowerCase()
                    const bName = (b.efnsDisplayName || b.name || b.field_name || b.variableName || "").toLowerCase()
                    return sortDir === "asc" ? aName.localeCompare(bName) : bName.localeCompare(aName)
                  })
                } else if (sortCol?.startsWith("col-")) {
                  const colId = sortCol.replace("col-", "")
                  const col = columns.find(c => String(c.id) === colId)
                  if (col) {
                    sortedFields.sort((a, b) => {
                      const aApp = isFieldApplicable(a, col) ? 1 : 0
                      const bApp = isFieldApplicable(b, col) ? 1 : 0
                      return sortDir === "asc" ? bApp - aApp : aApp - bApp
                    })
                  }
                }

                return (
                  <React.Fragment key={automation.id}>
                    {/* Category Separator Row */}
                    <TableRow
                      className={cn(
                        "hover:bg-slate-200/80 cursor-pointer transition-colors",
                        isRunning ? "bg-purple-50/80" : "bg-slate-100/80"
                      )}
                      onClick={() => setExpandedAutomations(prev => {
                        const next = new Set(prev)
                        if (next.has(automation.id)) next.delete(automation.id)
                        else next.add(automation.id)
                        return next
                      })}
                    >
                      <TableCell colSpan={columns.length + 2} className="h-10 py-0 px-4 border-b border-slate-200 sticky left-0 z-20">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            {isExpanded ? <ChevronDown className="h-4 w-4 text-slate-500" /> : <ChevronRight className="h-4 w-4 text-slate-500" />}
                            {isRunning ? <Loader2 className="h-3.5 w-3.5 animate-spin text-purple-600" /> : <Zap className="h-3.5 w-3.5 text-purple-600" />}
                            <span className="text-[11px] font-black uppercase tracking-widest text-slate-700">
                              {automation.name || automation.automation_name || `Automation #${automation.id}`}
                            </span>
                            <Badge variant="outline" className="text-[9px] h-4 px-1.5 bg-white border-slate-300 text-slate-500">
                              {fields.length} Fields
                            </Badge>
                            {isRunning && (
                              <Badge className="bg-purple-100 text-purple-700 border-purple-200 text-[9px]">
                                Running...
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            {isRunning ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 text-[10px] text-red-600 hover:bg-red-50 font-bold gap-1"
                                onClick={(e) => { e.stopPropagation(); stopAutomation(); }}
                              >
                                <StopCircle className="h-3.5 w-3.5" /> Stop
                              </Button>
                            ) : (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 text-[10px] text-green-600 hover:bg-green-50 font-bold gap-1"
                                onClick={(e) => { e.stopPropagation(); handleRunAutomation(automation); }}
                              >
                                <Play className="h-3.5 w-3.5" /> Run
                              </Button>
                            )}
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>

                    {/* Automation Fields Rows */}
                    {isExpanded && sortedFields.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={columns.length + 2} className="h-16 text-center text-xs font-medium text-slate-400 bg-slate-50">
                          No fields configured in this automation.
                        </TableCell>
                      </TableRow>
                    )}

                    {isExpanded && sortedFields.map((field: any, idx: number) => {
                      const isDocument = field.fieldType === 'document'
                      const isComputed = field.fieldType === 'computed'
                      const isArray = field.fieldType === 'array'

                      return (
                        <TableRow key={field.id || field.variableName || idx} className="group hover:bg-slate-50/50">
                          <TableCell className="h-12 text-center text-[10px] font-mono text-slate-400 border-b border-r sticky left-0 bg-white group-hover:bg-slate-50/50 z-10">
                            {idx + 1}
                          </TableCell>
                          <TableCell className="h-12 border-b border-r sticky left-12 bg-white group-hover:bg-slate-50/50 z-10 p-3">
                            <div className="flex flex-col gap-1.5">
                              <div className="flex items-center gap-2">
                                <FileText className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                                <span className="text-xs font-semibold text-slate-700 line-clamp-1">
                                  {field.efnsDisplayName || field.name || field.field_name || field.variableName || `Field #${field.id}`}
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                {field.fieldType && (
                                  <span className="bg-slate-100 border border-slate-200 text-slate-500 px-1.5 py-0.5 rounded text-[9px] uppercase font-bold tracking-wider">
                                    {field.fieldType}
                                  </span>
                                )}
                                {(field.entityTypes || (field.entityType ? [field.entityType] : [])).map((et: string) => (
                                  <span key={et} className="bg-blue-50 text-blue-700 border border-blue-100 px-1.5 py-0.5 rounded text-[9px] uppercase font-bold tracking-wider">
                                    {et}
                                  </span>
                                ))}
                              </div>
                            </div>
                          </TableCell>
                          {columns.map(col => {
                            const applicable = isFieldApplicable(field, col)
                            const cacheKey = `${field.variableName || field.name}-${col.id}`
                            const val = resolvedValues[cacheKey]
                            const isResolving = resolving[cacheKey] || false
                            const isMissing = !isValidValue(val)
                            const isEditing = editingCell?.field?.variableName === field.variableName && editingCell?.col?.id === col.id

                            return (
                              <TableCell
                                key={`fv-${field.id || field.variableName}-${col.type}-${col.id}`}
                                className="h-12 text-center border-b border-r p-2 align-middle transition-colors"
                                onClick={() => {
                                  if (isEditing) return;
                                  if (val === undefined && !isResolving) resolveFieldForCol(field, col);
                                }}
                              >
                                {!applicable ? (
                                  <span className="text-[9px] font-bold text-slate-300 uppercase italic">N/A</span>
                                ) : isDocument ? (
                                  <div className="flex items-center justify-center gap-1 bg-blue-50 text-blue-600 px-2 py-1 rounded border border-blue-100 w-fit mx-auto">
                                    <Database className="h-3 w-3" />
                                    <span className="text-[9px] font-bold uppercase tracking-wider">Doc Mapping</span>
                                  </div>
                                ) : isComputed ? (
                                  <div className="flex items-center justify-center gap-1 bg-amber-50 text-amber-600 px-2 py-1 rounded border border-amber-100 w-fit mx-auto">
                                    <Zap className="h-3 w-3" />
                                    <span className="text-[9px] font-bold uppercase tracking-wider">Computed</span>
                                  </div>
                                ) : isArray ? (
                                  <div className="flex items-center justify-center gap-1 bg-indigo-50 text-indigo-600 px-2 py-1 rounded border border-indigo-100 w-fit mx-auto">
                                    <Database className="h-3 w-3" />
                                    <span className="text-[9px] font-bold uppercase tracking-wider">Array Items</span>
                                  </div>
                                ) : isEditing ? (
                                  <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                                    <Input
                                      className="h-7 w-28 text-[10px] px-1.5"
                                      value={editValue}
                                      onChange={e => setEditValue(e.target.value)}
                                      onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') cancelEditing(); }}
                                      autoFocus
                                    />
                                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-green-600" onClick={(e) => { e.stopPropagation(); saveEdit(); }}>
                                      <CheckCircle2 className="h-3 w-3" />
                                    </Button>
                                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-red-400" onClick={(e) => { e.stopPropagation(); cancelEditing(); }}>
                                      <X className="h-3 w-3" />
                                    </Button>
                                  </div>
                                ) : isResolving ? (
                                  <Loader2 className="h-4 w-4 animate-spin text-purple-500 mx-auto" />
                                ) : val !== undefined ? (
                                  <div
                                    className={cn(
                                      "px-2 py-1 rounded border inline-block max-w-full cursor-pointer hover:ring-1 hover:ring-purple-300",
                                      isMissing ? "bg-red-50 border-red-100" : "bg-green-50 border-green-100"
                                    )}
                                    onClick={(e) => { e.stopPropagation(); startEditing(field, col, val); }}
                                  >
                                    <span className={cn(
                                      "text-[11px] font-bold truncate block w-full",
                                      isMissing ? "text-red-500 uppercase text-[9px] tracking-wider" : "text-green-700"
                                    )}>
                                      {isMissing ? 'Missing' : cleanFieldValue(val)}
                                    </span>
                                  </div>
                                ) : (
                                  <Button variant="ghost" size="sm" className="h-7 text-[10px] text-purple-600 hover:bg-purple-50 border border-transparent hover:border-purple-200 font-bold gap-1"
                                    onClick={(e) => { e.stopPropagation(); resolveFieldForCol(field, col) }}>
                                    <Eye className="h-3.5 w-3.5" /> Resolve
                                  </Button>
                                )}
                              </TableCell>
                            )
                          })}
                        </TableRow>
                      )
                    })}

                    {/* Console/logs panel for this automation */}
                    {isRunning && showConsole && automationProgress && (
                      <TableRow>
                        <TableCell colSpan={columns.length + 2} className="p-0 border-b">
                          <div className="bg-slate-900 text-green-400 font-mono text-[10px] p-3 max-h-48 overflow-y-auto">
                            <div className="flex items-center gap-2 mb-2 text-[9px] text-slate-400 uppercase tracking-wider font-bold">
                              <Terminal className="h-3 w-3" />
                              Console — {automationProgress.status || 'Running'}
                              <span className="ml-auto">{automationProgress.progress || 0}%</span>
                            </div>
                            {(automationProgress.logs || []).map((log: any, i: number) => (
                              <div key={i} className="flex gap-2 leading-5">
                                <span className="text-slate-500 shrink-0">
                                  {log.timestamp ? new Date(log.timestamp).toLocaleTimeString() : ''}
                                </span>
                                <span className={cn(
                                  log.level === 'error' ? 'text-red-400' :
                                  log.level === 'warn' ? 'text-yellow-400' :
                                  log.level === 'success' ? 'text-green-300' : 'text-green-400'
                                )}>
                                  {log.message || JSON.stringify(log)}
                                </span>
                              </div>
                            ))}
                            {(automationProgress.logs || []).length === 0 && (
                              <div className="text-slate-500 italic">Waiting for logs...</div>
                            )}
                            <div ref={logsEndRef} />
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
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold">
              {previewingDocuments?.document_display_name || 'Document Preview'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {previewingDocuments?.documents?.map((doc: any, idx: number) => {
              const fileUrl = getFileUrl(doc.file_path);
              return (
                <div key={idx} className="border rounded-lg overflow-hidden">
                  <div className="bg-slate-50 px-3 py-2 border-b flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-600">{doc.file_name}</span>
                    {fileUrl && (
                      <a href={fileUrl} target="_blank" rel="noopener noreferrer" className="text-[10px] text-blue-600 hover:underline">
                        Open full size
                      </a>
                    )}
                  </div>
                  {fileUrl && (
                    <div className="p-2 bg-slate-100/50 flex items-center justify-center">
                      <img src={fileUrl} alt={doc.file_name} className="max-w-full max-h-[400px] object-contain rounded" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
