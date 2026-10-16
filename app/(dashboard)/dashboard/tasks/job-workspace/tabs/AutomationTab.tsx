// @ts-nocheck
"use client"

import React, { useState, useMemo, useCallback, useEffect } from "react"
import { ChevronDown, ChevronRight, ChevronUp, FileText, User, Loader2, RefreshCw, CheckCircle2, AlertCircle, Eye, Briefcase, UserCheck, HeartPulse, ArrowUpDown, ArrowUp, ArrowDown, Users2, Database, Zap, Search, Play, X, StopCircle, Terminal, Calendar, Edit3, Check, Link2, Lock, ChevronsDownUp, ChevronsUpDown, Shield } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Command, CommandGroup, CommandItem, CommandList } from "@/components/ui/command"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { SearchableSelect } from "@/components/ui/searchable-select"
import { cn } from "@/lib/utils"
import { resolveVariableValueImpl, resolveTargetEntityIdImpl, fetchSourceDataImpl, getArrayFieldDataImpl, getFieldValueImpl, type FieldResolutionContext } from "../../utils/fieldResolution"
import { isValidValue, cleanFieldValue, updateJsonValue, ETA_SCREENSHOT_DOCUMENT_ID } from "../../utils/AutomationMappingDialog"
import { executeComputedField } from "../../utils/automationComputedFunctions"
import { isTemplateEligible, fetchMasterFieldsRecord } from "../../../tasks-requirements/utils/templateGenerationData"
import type { JobWorkspaceData } from "../fetchJobWorkspaceData"
import {
  isFieldApplicable, getFieldLabel, buildRelationshipData, buildDocsByEntity, latestDoc, getFileUrl, cleanFormData,
  deriveAutomationType as deriveAutomationTypeShared, saveEvidenceScreenshot,
} from "../automationShared"
import supabase from "@/lib/supabase/client"
import { toast } from '@/lib/hooks/use-toast'
import { ExtractionPreview } from "@/components/ExtractionPreview"
import { useCurrentUser } from "@/lib/hooks/use-current-user"
import { auditActor } from "../../utils/audit"
import { automationFetch } from "@/lib/automations/client"

interface AutomationTabProps {
  data: JobWorkspaceData
  onRefresh?: () => void
  highlightAutomationId?: string | number
  /** Application guide: show only this automation (the one being applied for). */
  focusAutomationId?: string | number | null
  onNavigateToRequirement?: (requirementId: string) => void
  onNavigateToTemplate?: (documentId: string) => void
  // Raw automation_jobs rows for this task, fetched once by the parent
  // JobWorkspace (it needs them too, for the tab-bar badge) - avoids this tab
  // re-running the identical query itself.
  automationJobs?: any[] | null
}

interface ColDef {
  type: string
  id: number | string
  label: string
  subLabel: string
  roles?: string[]
  priority: number
}

function HighlightText({ text, query }: { text: string; query: string }) {
  if (!query || !text) return <>{text}</>
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const parts = text.split(new RegExp(`(${escaped})`, 'gi'))
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1
          ? <mark key={i} className="bg-yellow-200 text-yellow-900 rounded px-0.5">{part}</mark>
          : <React.Fragment key={i}>{part}</React.Fragment>
      )}
    </>
  )
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

function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return "—"
  const diffMs = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(iso).toLocaleDateString()
}

export function AutomationTab({ data, onRefresh, highlightAutomationId, focusAutomationId, onNavigateToRequirement, onNavigateToTemplate, automationJobs }: AutomationTabProps) {
  const { task, automations: allAutomations, automationLinkSources = {}, kycDocsMap } = data
  // In the application guide the matrix narrows to the application being worked on.
  const automations = useMemo(
    () => (focusAutomationId ? (allAutomations || []).filter((a: any) => String(a.id) === String(focusAutomationId)) : allAutomations),
    [allAutomations, focusAutomationId]
  )
  const { user: currentUser } = useCurrentUser();
  const actor = auditActor(currentUser);
  const [expandedAutomations, setExpandedAutomations] = useState<Set<number>>(new Set(automations?.map(a => a.id) || []))
  const [highlightedRowId, setHighlightedRowId] = useState<string | number | null>(null)
  const automationRowRefs = React.useRef<Record<string, HTMLTableRowElement | null>>({})
  const [expandedArrayFields, setExpandedArrayFields] = useState<Set<string>>(new Set())
  const [sortCol, setSortCol] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc")
  const [fieldSourceDataCache, setFieldSourceDataCache] = useState<Record<string, Record<string, any>>>({})
  const [fieldMasterComputedCache, setFieldMasterComputedCache] = useState<Record<string, any>>({})
  const [resolvedValues, setResolvedValues] = useState<Record<string, any>>({})
  const [resolving, setResolving] = useState<Record<string, boolean>>({})
  const [jobFieldsRecord, setJobFieldsRecord] = useState<Record<string, any>>({})
  const [runningAutomationId, setRunningAutomationId] = useState<number | null>(null)
  const [automationJobId, setAutomationJobId] = useState<string | null>(null)
  const [automationProgress, setAutomationProgress] = useState<any>(null)
  const [pollingInterval, setPollingInterval] = useState<NodeJS.Timeout | null>(null)
  // Latest automation_jobs row per automation.id for this task, keyed by String(automation_id).
  // Persisted in Supabase so "last run" status/audit survives a page refresh, unlike
  // runningAutomationId/automationProgress which are ephemeral React state.
  const [lastRunByAutomation, setLastRunByAutomation] = useState<Record<string, any>>({})
  const [showConsole, setShowConsole] = useState(false)
  const [editingCell, setEditingCell] = useState<any>(null)
  const [editValue, setEditValue] = useState('')
  const [isSavingEdit, setIsSavingEdit] = useState(false)
  const [arrayOverrides, setArrayOverrides] = useState<Record<string, Record<string, any>>>({})
  const [editingArrayCell, setEditingArrayCell] = useState<any>(null)
  const [arrayEditValue, setArrayEditValue] = useState('')
  const [isSavingArrayEdit, setIsSavingArrayEdit] = useState(false)
  const [docPreviewOpen, setDocPreviewOpen] = useState(false)
  const [docPreviewData, setDocPreviewData] = useState<any>(null)
  const [docPreviewLoading, setDocPreviewLoading] = useState<string | null>(null)
  const [computedFieldsPreview, setComputedFieldsPreview] = useState<Record<string, string>>({})
  const [isComputing, setIsComputing] = useState(false)
  const [showPreviewModal, setShowPreviewModal] = useState(false)
  const [previewingDocuments, setPreviewingDocuments] = useState<any>(null)
  const [savedScreenshotDoc, setSavedScreenshotDoc] = useState<any>(null)
  const [isSavingScreenshot, setIsSavingScreenshot] = useState(false)
  const [individualName, setIndividualName] = useState<string>('')
  const [searchQuery, setSearchQuery] = useState('')
  const [showMissingOnly, setShowMissingOnly] = useState(false)
  const logsEndRef = React.useRef<HTMLDivElement>(null)
  const columns = useMemo(() => buildParticipantColumns(task), [task])

  const relationshipData = useMemo(() => buildRelationshipData(task), [task])

  // Shared session cache of tm_job_fields (also used by the Requirements/Templates tabs
  // and guided mode) - a superset of the fields linked here, fetched once.
  useEffect(() => {
    let cancelled = false
    fetchMasterFieldsRecord().then(record => { if (!cancelled) setJobFieldsRecord(record) })
    return () => { cancelled = true }
  }, [])

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

  // Every document for this task's people/companies is already in `data` (loaded once
  // by fetchJobWorkspaceData) - derive per-entity document status from it instead of
  // re-querying the same tables whenever an automation is expanded.
  const docStatusByEntity = useMemo(
    () => buildDocsByEntity(data.documentsByIndividual, data.allCompanyDocuments),
    [data.documentsByIndividual, data.allCompanyDocuments]
  )
  const docStatusLoaded = true

  const getDocsForCol = useCallback((linkedKycDocuments: string[] | undefined, col: ColDef) => {
    const docs = docStatusByEntity[String(col.id)] || []
    return docs.filter((d: any) => linkedKycDocuments?.includes(d.document_id))
  }, [docStatusByEntity])

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

  const getFieldSortValue = useCallback((field: any, colKey: string): string => {
    if (colKey === "field-name") return getFieldLabel(field).toLowerCase()
    if (colKey === "type") return (field.fieldType || "text").toLowerCase()
    if (colKey === "source") return (field.customFieldSource || "").toLowerCase()
    const col = columns.find(c => String(c.id) === colKey)
    if (col) {
      const cacheKey = `${field.variableName || field.name || field.field_name}-${col.id}`
      const val = resolvedValues[cacheKey]
      if (val === undefined || val === null) return ""
      return String(val).toLowerCase()
    }
    return ""
  }, [columns, resolvedValues])

  const getSortedFields = useCallback((fields: any[]) => {
    if (!sortCol) return fields
    return [...fields].sort((a, b) => {
      const av = getFieldSortValue(a, sortCol)
      const bv = getFieldSortValue(b, sortCol)
      const cmp = av < bv ? -1 : av > bv ? 1 : 0
      return sortDir === "asc" ? cmp : -cmp
    })
  }, [sortCol, sortDir, getFieldSortValue])

  const allArrayExpandKeys = useMemo(() => {
    const keys: string[] = []
      ; (automations || []).forEach((auto: any) => {
        if (!expandedAutomations.has(auto.id)) return
          ; (auto.webdata || []).forEach((f: any) => {
            if (f.fieldType === 'array') keys.push(`${auto.id}-${f.variableName || f.name || f.field_name}`)
          })
      })
    return keys
  }, [automations, expandedAutomations])

  const allArraysExpanded = allArrayExpandKeys.length > 0 && allArrayExpandKeys.every(k => expandedArrayFields.has(k))

  const handleToggleAllArrays = () => {
    setExpandedArrayFields(prev => {
      const next = new Set(prev)
      if (allArraysExpanded) allArrayExpandKeys.forEach(k => next.delete(k))
      else allArrayExpandKeys.forEach(k => next.add(k))
      return next
    })
  }
  const deriveAutomationType = deriveAutomationTypeShared

  const filteredAutomations = useMemo(() => {
    if (!searchQuery.trim()) return automations || []
    const q = searchQuery.toLowerCase().trim()
    return (automations || []).filter((auto: any) => {
      const name = (auto.name || '').toLowerCase()
      const type = deriveAutomationType(auto).toLowerCase()
      if (name.includes(q) || type.includes(q)) return true
      return (auto.webdata || []).some((field: any) => {
        const fLabel = getFieldLabel(field).toLowerCase()
        const fType = (field.fieldType || '').toLowerCase()
        const fSource = (field.customFieldSource || '').toLowerCase()
        return fLabel.includes(q) || fType.includes(q) || fSource.includes(q)
      })
    })
  }, [automations, searchQuery, deriveAutomationType])

  useEffect(() => {
    if (!searchQuery.trim()) return
    setExpandedAutomations(prev => {
      const next = new Set(prev)
      filteredAutomations.forEach((a: any) => next.add(a.id))
      return next
    })
  }, [searchQuery, filteredAutomations])

  const missingStats = useMemo(() => {
    let totalApplicable = 0
    let missingCount = 0
    const missingAutoIds = new Set<number>()
    ;(automations || []).forEach((auto: any) => {
      (auto.webdata || []).forEach((field: any) => {
        if (field.fieldType === 'array' || field.fieldType === 'document' || field.fieldType === 'computed') return
        const mIds = field.linkedMasterFields || field.masterFieldIds || []
        const qIds = field.linkedJobQuestionIds || []
        if (mIds.length === 0 && qIds.length === 0 && !field.customFieldSource) return
        columns.forEach((col: any) => {
          if (!isFieldApplicable(field, col)) return
          totalApplicable++
          const cacheKey = `${field.variableName || field.name || field.field_name}-${col.id}`
          const val = resolvedValues[cacheKey]
          if (!isValidValue(val)) {
            missingCount++
            missingAutoIds.add(auto.id)
          }
        })
      })
    })
    return { totalApplicable, missingCount, filledCount: totalApplicable - missingCount, missingAutoIds }
  }, [automations, columns, resolvedValues])

  useEffect(() => {
    if (!showMissingOnly || missingStats.missingAutoIds.size === 0) return
    setExpandedAutomations(prev => {
      const next = new Set(prev)
      missingStats.missingAutoIds.forEach(id => next.add(id))
      return next
    })
  }, [showMissingOnly, missingStats.missingAutoIds])

  const missingProgress = missingStats.totalApplicable > 0
    ? Math.round((missingStats.filledCount / missingStats.totalApplicable) * 100)
    : 100

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
      return await saveEvidenceScreenshot(blob, directorId, task?.id, actor.by_id);
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

    // The runner's own result can say the underlying task wasn't actually finished
    // (e.g. a form was filled but submission is still manual) even though the DB job
    // status is 'completed' - don't tell the user it succeeded when it didn't.
    const needsReview = job.result?.status === 'needs_review';
    toast({
      title: needsReview ? '⚠️ Needs Review' : '✅ Automation Completed!',
      description: job.result?.message || job.message || 'Automation completed successfully.',
      variant: needsReview ? 'warning' : undefined,
    });
  }, [getPrimaryTargetEntityId, individualName, onRefresh, saveScreenshotToSupabase]);

  // Polls the local automation server (see lib/automations/client).
  //
  // This used to read the `automation_jobs` table directly, which only worked
  // because a separate worker process was claiming and completing rows there.
  // Automations now run in a child process of the desktop app, so live state is
  // in that process's memory and the durable record is tm_automation_runs. The
  // automationFetch merges both and returns the same shape this handler always
  // consumed, so nothing below had to change.
  const pollSupabaseJob = useCallback(async (jobId: string) => {
    try {
      const response = await automationFetch(`/api/automations/progress?jobId=${encodeURIComponent(jobId)}`, {
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => null);
      const job = payload?.job;

      if (!response.ok || !job) {
        // A 503 means the automation service is gone and retrying will not help.
        if (response.status === 503) {
          clearPolling();
          setRunningAutomationId(null);
          toast({
            title: '❌ Automation Service Unavailable',
            description: payload?.error || 'Restart the desktop app to run automations.',
            variant: 'destructive',
          });
          return;
        }
        if (response.status === 404) {
          clearPolling();
          setRunningAutomationId(null);
          return;
        }
        return;
      }

      setAutomationProgress({
        isRunning: job.isRunning,
        progress: job.progress || 0,
        currentStep: job.currentStep || '',
        message: job.message || '',
        logs: job.logs || [],
        evidence: job.evidence || [],
        status: job.status,
      });

      if (job.status === 'completed' || job.status === 'failed') {
        // Record the terminal result so the last-run badge reflects it immediately,
        // without waiting for a page refresh to re-query run history.
        const autoId = job.automationId;
        if (autoId) setLastRunByAutomation(prev => ({ ...prev, [String(autoId)]: job }));
      }

      if (job.status === 'completed') {
        clearPolling();
        setRunningAutomationId(null);
        await handleCompletedJob(job);
      } else if (job.status === 'failed' || job.status === 'cancelled' || job.status === 'interrupted') {
        clearPolling();
        setRunningAutomationId(null);
        toast({
          title: job.status === 'cancelled' ? '🛑 Automation Stopped' : '❌ Automation Failed',
          description: job.error || 'Unknown error',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Error polling automation:', error);
    }
  }, [handleCompletedJob, clearPolling, toast]);

  const stopAutomation = useCallback(async () => {
    if (!automationJobId) return;

    // Asks the automation server to close the browser. It used to write
    // status='failed' straight into automation_jobs, which left the worker
    // queue to notice the row had changed - the run itself kept going in the
    // browser until it happened to fail on its own.
    try {
      const response = await automationFetch('/api/automations/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: automationJobId }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        toast({
          title: 'Could not stop automation',
          description: payload?.error || 'Unknown error',
          variant: 'destructive',
        });
        return;
      }
    } catch (error: any) {
      toast({
        title: 'Could not stop automation',
        description: error.message,
        variant: 'destructive',
      });
      return;
    }

    const autoId = runningAutomationId;
    if (autoId != null) {
      setLastRunByAutomation(prev => ({
        ...prev,
        [String(autoId)]: {
          ...(prev[String(autoId)] || {}),
          status: 'cancelled',
          error: 'Stopped by user',
          completed_at: new Date().toISOString(),
        },
      }));
    }
    clearPolling();
    setRunningAutomationId(null);
    setAutomationProgress(prev => prev ? { ...prev, isRunning: false, message: 'Stopped by user' } : prev);
  }, [automationJobId, runningAutomationId, clearPolling, toast]);

  useEffect(() => {
    return () => {
      if (pollingInterval) clearInterval(pollingInterval);
    };
  }, [pollingInterval]);

  // pollSupabaseJob gets a new identity every render (it depends, via
  // handleCompletedJob, on non-memoized helpers). Reaching it through a ref keeps the
  // effect below keyed on the run history alone - with pollSupabaseJob as a dependency
  // it re-ran every render, and its setLastRunByAutomation(new object) re-rendered
  // again: "Maximum update depth exceeded" on any task that had run history.
  const pollSupabaseJobRef = React.useRef(pollSupabaseJob);
  pollSupabaseJobRef.current = pollSupabaseJob;

  // Whenever the parent's run history arrives/changes (fetched once in JobWorkspace
  // and passed down, rather than this tab re-querying it itself), derive "last run"
  // status per automation so it survives a page refresh, and transparently resume
  // live polling if a run is still in flight - otherwise a refresh mid-run looks
  // like the automation was never started.
  useEffect(() => {
    if (!task?.id || !automationJobs?.length) return;

    const latest: Record<string, any> = {};
    automationJobs.forEach((j: any) => {
      const autoId = j.automation_id;
      if (autoId && !latest[autoId]) latest[autoId] = j;
    });
    setLastRunByAutomation(latest);

    const activeRun = automationJobs.find((j: any) => j.status === 'pending' || j.status === 'running');
    // job_id is the automation server's handle; without it there is nothing to
    // poll, so show the run as in-flight and let the desktop shell's terminal
    // event settle it rather than polling a null id.
    if (activeRun) {
      setRunningAutomationId(activeRun.automation_id);
      setShowConsole(true);
      setAutomationProgress({
        isRunning: true,
        progress: activeRun.progress || 0,
        currentStep: activeRun.current_step || '',
        message: activeRun.current_step || 'Resuming...',
        logs: [],
        evidence: [],
        status: activeRun.status,
      });
      if (activeRun.job_id) {
        setAutomationJobId(activeRun.job_id);
        const interval = setInterval(() => pollSupabaseJobRef.current(activeRun.job_id), 2000);
        setPollingInterval(interval);
      }
    }
  }, [task?.id, automationJobs]);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [automationProgress?.logs?.length]);

  // Scroll to and highlight a specific automation when deep-linked from a stage cell
  useEffect(() => {
    if (!highlightAutomationId) return
    const match = (automations || []).find(a => String(a.id) === String(highlightAutomationId))
    if (!match) return
    setExpandedAutomations(prev => new Set(prev).add(match.id))
    const timer = setTimeout(() => {
      automationRowRefs.current[String(match.id)]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      setHighlightedRowId(match.id)
    }, 150)
    const clearTimer = setTimeout(() => setHighlightedRowId(null), 3000)
    return () => { clearTimeout(timer); clearTimeout(clearTimer) }
  }, [highlightAutomationId, automations]);

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

  // Same context shape used for both resolving a per-column cell value and for
  // re-resolving it after a save, so edits and display always agree. Accepts an
  // optional sourceData override so a just-written record can be re-resolved
  // before the fieldSourceDataCache state update has actually landed.
  const buildColCtx = useCallback((field: any, col: ColDef, sourceDataOverride?: Record<string, Record<string, any>>): FieldResolutionContext => ({
    sourceData: sourceDataOverride || fieldSourceDataCache,
    jobFields: jobFieldsRecord,
    webData: [{ automationId: String(field.automation_id || ""), fields: [field] }],
    selectedAutomationId: String(field.automation_id || ""),
    masterFieldComputedValues: fieldMasterComputedCache,
    relationshipData: relationshipData[0],
    taskId: String(task?.id || ""),
    currentIndividualId: col.type === 'company' ? String(task?.individual_id || "") : String(col.id),
    task,
  }), [fieldSourceDataCache, jobFieldsRecord, fieldMasterComputedCache, relationshipData, task]);

  // Resolves which DB table/path a specific master field (or, lacking one, a linked
  // job question) actually persists to - mirrors AutomationMappingDialog's own
  // persistenceSource derivation so edits made here land in the same place.
  const getPersistenceSource = useCallback((masterFieldId: any, questionId: any, entityCategory: string) => {
    if (masterFieldId != null) {
      const mDef = jobFieldsRecord[String(masterFieldId)]
      if (!mDef) return null
      return mDef.sources?.find((s: any) => s.source_type === entityCategory) || mDef.sources?.[0] || null
    }
    if (questionId != null) {
      return { table: 'tm_tasks', path: `job_specific_answers ->> '${questionId}'`, linking_variable: 'id' }
    }
    return null
  }, [jobFieldsRecord]);

  const resolveVariableValue = useCallback((fieldDef: any, targetEntityId: string) =>
    resolveVariableValueImpl(fieldDef, targetEntityId, buildFieldResolutionContextForAuto(fieldDef.automation_id || "", [fieldDef])),
    [buildFieldResolutionContextForAuto]);

  const getArrayFieldData = useCallback((field: any) =>
    getArrayFieldDataImpl(field, buildFieldResolutionContextForAuto(field.automation_id || "", [field])),
    [buildFieldResolutionContextForAuto]);

  const getArrayOverrideKey = useCallback((field: any, entityId: any) => {
    const fieldKey = field.variableName || field.name || field.field_name
    return `${field.automation_id || field.automationId || ''}-${fieldKey}-${entityId}`
  }, []);

  const mergeArrayOverrides = useCallback((field: any, rows: any[]) => {
    return (rows || []).map((row: any) => {
      const overrides = arrayOverrides[getArrayOverrideKey(field, row.entityId)]
      return overrides ? { ...row, ...overrides } : row
    })
  }, [arrayOverrides, getArrayOverrideKey]);

  const startEditingArrayCell = (field: any, entityId: any, item: any, currentVal: any, masterFieldId?: any, questionId?: any) => {
    const entityCategory = (item.entityTypes || field.entityTypes || []).includes('company') ? 'company' : 'individual'
    const resolvedMasterId = masterFieldId !== undefined ? masterFieldId : (item?.linkedMasterFields?.[0] || item?.masterFieldIds?.[0])
    const resolvedQuestionId = resolvedMasterId == null ? (questionId !== undefined ? questionId : item?.linkedJobQuestionIds?.[0]) : null
    const persistenceSource = getPersistenceSource(resolvedMasterId, resolvedQuestionId, entityCategory)
    setEditingArrayCell({ overrideKey: getArrayOverrideKey(field, entityId), itemVar: item.variableName, masterFieldId: resolvedMasterId, persistenceSource, entityId })
    setArrayEditValue(currentVal !== null && currentVal !== undefined && currentVal !== 'Missing' ? String(currentVal) : '')
  };

  const cancelEditingArrayCell = () => { setEditingArrayCell(null); setArrayEditValue('') };

  const saveArrayCellEdit = async (isDropdown?: boolean, dropdownOptions?: { label: string, value: string }[]) => {
    if (!editingArrayCell) return;
    const { overrideKey, itemVar, persistenceSource, entityId } = editingArrayCell;
    let valueToSave = arrayEditValue;
    if (isDropdown && dropdownOptions && dropdownOptions.length > 0) {
      const selectedOption = dropdownOptions.find(opt => opt.value === arrayEditValue);
      if (selectedOption) valueToSave = selectedOption.label;
    }

    if (!persistenceSource?.table || !persistenceSource?.path || entityId == null) {
      setArrayOverrides(prev => ({ ...prev, [overrideKey]: { ...(prev[overrideKey] || {}), [itemVar]: valueToSave } }));
      setEditingArrayCell(null);
      setArrayEditValue('');
      toast({ title: 'Overridden', description: 'Saved locally - no linked database field to update.' });
      return;
    }

    setIsSavingArrayEdit(true);
    try {
      const { table, path, linking_variable } = persistenceSource;
      const eId = String(entityId);
      let record = fieldSourceDataCache[table]?.[eId];
      if (!record) {
        let query = supabase.from(table).select('*');
        if (table === 'tm_tasks') query = query.eq('id', eId);
        else if (linking_variable) query = query.eq(linking_variable, eId);
        else query = query.or(`id.eq.${eId},director_id.eq.${eId},company_id.eq.${eId}`);
        const { data, error } = await query.maybeSingle();
        if (error) throw error;
        if (!data) throw new Error(`Record not found in ${table} for ${eId}`);
        record = data;
      }
      const queryField = table === 'tm_tasks' ? 'id' : linking_variable ? linking_variable : record.director_id ? 'director_id' : record.company_id ? 'company_id' : 'id';
      const recordPK = table === 'tm_tasks' ? record.id : linking_variable ? eId : (record.director_id || record.company_id || record.id);
      const updated = updateJsonValue(record, path, valueToSave);
      const { data: updatedRecord, error: updateError } = await supabase
        .from(table)
        .update({
          ...updated,
          updated_at: new Date().toISOString(),
          updated_by_id: actor.by_id,
        })
        .eq(queryField, recordPK)
        .select()
        .single();
      if (updateError) throw updateError;

      setFieldSourceDataCache(prev => ({ ...prev, [table]: { ...(prev[table] || {}), [eId]: updatedRecord } }));

      // The DB now reflects the edited value, and array rows are recomputed live
      // from fieldSourceDataCache each render - so the local override is no longer
      // needed and would otherwise shadow the freshly-persisted (and possibly
      // priority/merge-resolved) value.
      setArrayOverrides(prev => {
        if (!prev[overrideKey]) return prev;
        const nextForKey = { ...prev[overrideKey] };
        delete nextForKey[itemVar];
        const next = { ...prev };
        if (Object.keys(nextForKey).length > 0) next[overrideKey] = nextForKey; else delete next[overrideKey];
        return next;
      });

      toast({ title: 'Saved', description: 'Field updated successfully.' });
    } catch (error: any) {
      console.error('Error saving array field:', error);
      toast({ title: 'Error', description: error.message || 'Failed to update field', variant: 'destructive' });
    } finally {
      setEditingArrayCell(null);
      setArrayEditValue('');
      setIsSavingArrayEdit(false);
    }
  };

  // A linked requirement that is itself template-backed (e.g. "Invitation Letter")
  // has its own dedicated generation flow in the Templates tab - jump straight
  // there instead of sending the user to Requirements only to have them redirect
  // again via that tab's own template wand button. Switches tabs in-app (via the
  // callbacks JobWorkspace passes down) since this task's data is already loaded -
  // no page reload/refetch needed. Falls back to a new-tab URL nav if this
  // component is ever used somewhere those callbacks aren't wired up.
  const handleGoToRequirement = useCallback((requirementId: string) => {
    const req = (task?.requirements || []).find((r: any) => String(r.id) === String(requirementId))
    if (req) {
      const hasTemplateExplicitly = req.hasTemplate === true || String(req.hasTemplate) === 'true'
      const docId = req.document_id || req.document_ids?.[0]
      if (hasTemplateExplicitly && docId) {
        const docMeta = kycDocsMap?.get?.(docId)
        if (isTemplateEligible(req, docMeta)) {
          if (onNavigateToTemplate) onNavigateToTemplate(docId)
          else window.open(`/dashboard/tasks/${task.id}?tab=templates&documentId=${docId}`, '_blank', 'noopener,noreferrer')
          return
        }
      }
    }
    if (onNavigateToRequirement) onNavigateToRequirement(requirementId)
    else window.open(`/dashboard/tasks/${task.id}?tab=requirements&requirementId=${requirementId}`, '_blank', 'noopener,noreferrer')
  }, [task, kycDocsMap, onNavigateToRequirement, onNavigateToTemplate])

  const handlePreviewDocumentField = useCallback(async (field: any, col: ColDef) => {
    const linkedDocIds: string[] = field.linkedKycDocuments || []
    if (linkedDocIds.length === 0) {
      toast({ title: 'No document linked', description: 'This field has no linked document type configured.', variant: 'destructive' })
      return
    }
    const loadingKey = `${field.variableName || field.name}-${col.id}`
    setDocPreviewLoading(loadingKey)
    try {
      let docs: any[] = []
      if (col.type === 'company') {
        const { data } = await supabase.from('acc_portal_kyc_uploads').select('*')
          .eq('company_id', col.id).in('document_id', linkedDocIds).neq('status', 'deleted')
        docs = data || []
      } else {
        const { data } = await supabase.from('acc_portal_directors_documents').select('*')
          .eq('director_id', col.id).in('document_id', linkedDocIds).neq('status', 'deleted')
        docs = data || []
      }
      if (docs.length === 0) {
        toast({ title: 'No document found', description: `No matching document has been uploaded for ${col.label} yet.`, variant: 'destructive' })
        return
      }

      const documentPreviews = await Promise.all(docs.map(async (doc: any) => {
        const { data: signData } = await supabase.storage.from('kyc-documents').createSignedUrl(doc.file_path, 3600)
        const fields: any[] = doc.document_id ? (kycDocsMap?.get?.(doc.document_id)?.fields || []) : []
        return {
          id: doc.id,
          fileUrl: signData?.signedUrl,
          extractedData: doc.extracted_details || {},
          fields,
          name: getFieldLabel(field),
          originalDoc: doc
        }
      }))

      setDocPreviewData({ documents: documentPreviews.filter(Boolean) })
      setDocPreviewOpen(true)
    } catch (err) {
      console.error('Error previewing document field:', err)
      toast({ title: 'Preview failed', description: 'Could not load the document preview.', variant: 'destructive' })
    } finally {
      setDocPreviewLoading(null)
    }
  }, [kycDocsMap]);

  // Follows the app's established client-side auth pattern (see sidebar.tsx's
  // useCurrentUser): no Supabase auth here, session lives behind /api/auth/session.
  const getCurrentUserInfo = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/session');
      const json = await res.json();
      if (json?.authenticated && json?.user) {
        const u = json.user;
        return {
          id: u.id || null,
          name: u.displayName || [u.firstName, u.lastName].filter(Boolean).join(' ') || u.username || null,
          email: u.email || null,
        };
      }
    } catch (err) {
      console.error('Error fetching current user for audit trail:', err);
    }
    return { id: null, name: null, email: null };
  }, []);

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
          formData[f.variableName] = mergeArrayOverrides(f, getArrayFieldData(f));
        } else if (f.fieldType === 'document') {
          // From the documents already loaded with the workspace - this used to read a
          // list that was only fetched after a run had started, so the first run of a
          // session sent every document (e.g. the passport) as null.
          const doc = latestDoc((docStatusByEntity[String(targetId)] || []).filter((d: any) => f.linkedKycDocuments?.includes(d.document_id)));
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

      const jobType = deriveAutomationType(automation);

      // Goes to a Next route, which creates the tm_automation_runs record and
      // then hands the work to the local automation server.
      //
      // This replaces a direct client-side insert into `automation_jobs`, which
      // persisted the whole payload - including the immigration portal password
      // built above - as plaintext in a database column. Nothing sensitive is
      // written now: the payload travels over loopback and only the outcome
      // screenshot comes back.
      const response = await automationFetch('/api/automations/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: jobType,
          taskId: task?.id ?? null,
          automationId,
          // tm_tasks has no task_name/title column. applicant_name and r_number
          // are the fields that actually identify a task in this schema.
          taskLabel: task?.applicant_name || task?.r_number || automation?.name || null,
          formData: cleanFormData(formData),
        }),
      });

      const started = await response.json().catch(() => null);

      if (!response.ok || !started?.success) {
        throw new Error(started?.error || 'Could not start the automation.');
      }

      setAutomationJobId(started.jobId);
      setAutomationProgress({
        isRunning: true,
        progress: 0,
        currentStep: 'Starting',
        message: 'Launching browser…',
        logs: [{ level: 'info', message: `Run ${started.runId} started.`, timestamp: new Date().toISOString() }],
      });

      const interval = setInterval(() => {
        pollSupabaseJob(started.jobId);
      }, 2000);
      setPollingInterval(interval);

      toast({
        title: 'Automation Started',
        description: `${automation.name || jobType} is running. You can keep working — you'll get a desktop notification when it finishes.`,
      });

    } catch (e) {
      console.error("Automation Error:", e);
      toast({ title: 'Automation Error', description: e.message || 'Unknown error', variant: 'destructive' });
      setRunningAutomationId(null);
    }
  }, [task, resolveTargetEntityId, getArrayFieldData, mergeArrayOverrides, docStatusByEntity, computedFieldsPreview, resolvedValues, resolveVariableValue, deriveAutomationType, pollSupabaseJob]);

  // masterFieldId identifies exactly which linked master field is being edited (the
  // one whose source was clicked in the "Linked Sources" popover, or the sole/primary
  // one for a single-source field) so the edit widget can show that field's own
  // dropdown options rather than always defaulting to the first linked source, and
  // so saveEdit knows exactly which DB table/path to persist to.
  const startEditing = async (field: any, col: ColDef, currentVal: any, masterFieldId?: string | number, questionId?: string) => {
    const entityCategory = field.entityTypes?.includes('company') ? 'company' : 'individual'
    const persistenceSource = getPersistenceSource(masterFieldId, masterFieldId == null ? questionId : null, entityCategory)
    const targetEntityId = resolveTargetEntityIdImpl(field, buildColCtx(field, col))
    setEditingCell({ field, col, currentVal, masterFieldId, persistenceSource, targetEntityId });
    setEditValue(currentVal !== null && currentVal !== undefined && currentVal !== 'Missing' ? String(currentVal) : '');
  };

  const cancelEditing = () => { setEditingCell(null); setEditValue(''); };

  const saveEdit = async (isDropdown?: boolean, dropdownOptions?: { label: string, value: string }[]) => {
    if (!editingCell) return;
    const { field, col, persistenceSource, targetEntityId } = editingCell;
    let valueToSave = editValue;
    if (isDropdown && dropdownOptions && dropdownOptions.length > 0) {
      const selectedOption = dropdownOptions.find(opt => opt.value === editValue);
      if (selectedOption) valueToSave = selectedOption.label;
    }
    const cacheKey = `${field.variableName || field.name || field.field_name}-${col.id}`;

    // No known DB source for this field (e.g. it's computed, or not linked to any
    // master field/question) - there's nothing to persist to, so keep it as a
    // local-only override that still flows into automation runs.
    if (!persistenceSource?.table || !persistenceSource?.path || targetEntityId == null) {
      setResolvedValues(prev => ({ ...prev, [cacheKey]: valueToSave }));
      setEditingCell(null);
      setEditValue('');
      toast({ title: 'Overridden', description: 'Saved locally - no linked database field to update.' });
      return;
    }

    setIsSavingEdit(true);
    try {
      const { table, path, linking_variable } = persistenceSource;
      const entityId = String(targetEntityId);
      let record = fieldSourceDataCache[table]?.[entityId];
      if (!record) {
        let query = supabase.from(table).select('*');
        if (table === 'tm_tasks') query = query.eq('id', entityId);
        else if (linking_variable) query = query.eq(linking_variable, entityId);
        else query = query.or(`id.eq.${entityId},director_id.eq.${entityId},company_id.eq.${entityId}`);
        const { data, error } = await query.maybeSingle();
        if (error) throw error;
        if (!data) throw new Error(`Record not found in ${table} for ${entityId}`);
        record = data;
      }
      const queryField = table === 'tm_tasks' ? 'id' : linking_variable ? linking_variable : record.director_id ? 'director_id' : record.company_id ? 'company_id' : 'id';
      const recordPK = table === 'tm_tasks' ? record.id : linking_variable ? entityId : (record.director_id || record.company_id || record.id);
      const updated = updateJsonValue(record, path, valueToSave);
      const { data: updatedRecord, error: updateError } = await supabase
        .from(table)
        .update({
          ...updated,
          updated_at: new Date().toISOString(),
          updated_by_id: actor.by_id,
        })
        .eq(queryField, recordPK)
        .select()
        .single();
      if (updateError) throw updateError;

      const nextSourceForTable = { ...(fieldSourceDataCache[table] || {}), [entityId]: updatedRecord };
      setFieldSourceDataCache(prev => ({ ...prev, [table]: nextSourceForTable }));

      // Re-resolve through the shared priority/merge logic instead of just echoing
      // the raw edited value back - a lower-priority source's edit shouldn't
      // clobber the display if a higher-priority source still has a value, and an
      // "all" sourceLogic field needs every source rejoined, not just this one.
      const freshCtx = buildColCtx(field, col, { ...fieldSourceDataCache, [table]: nextSourceForTable });
      const freshTargetId = resolveTargetEntityIdImpl(field, freshCtx);
      const freshVal = freshTargetId != null ? resolveVariableValueImpl(field, String(freshTargetId), freshCtx) : valueToSave;
      setResolvedValues(prev => ({ ...prev, [cacheKey]: freshVal }));

      toast({ title: 'Saved', description: 'Field updated successfully.' });
    } catch (error: any) {
      console.error('Error saving field:', error);
      toast({ title: 'Error', description: error.message || 'Failed to update field', variant: 'destructive' });
    } finally {
      setEditingCell(null);
      setEditValue('');
      setIsSavingEdit(false);
    }
  };

  useEffect(() => {
    const fetchIndividualName = async () => {
      const indId = task?.individual_id;
      if (!indId) return;
      const relData = relationshipData[0];
      if (relData?.principal?.full_name) { setIndividualName(relData.principal.full_name); return; }
      if (data.individual?.full_name && String(data.individual.id) === String(indId)) {
        setIndividualName(data.individual.full_name);
        return;
      }
      try {
        const { data: individual } = await supabase.from('registry_individuals').select('full_name').eq('id', indId).single();
        if (individual) setIndividualName(individual.full_name);
      } catch (error) { console.error('Error fetching individual name:', error); }
    };
    fetchIndividualName();
  }, [task?.individual_id, relationshipData, data.individual]);

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

  const totalCols = columns.length + 4

  return (
    <div className="h-full flex flex-col overflow-hidden bg-white px-6 py-4">
      {/* Header Bar */}
      <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4 bg-white shrink-0 z-40">
        <div className="flex items-center gap-4">
          <h3 className="text-lg font-bold text-slate-900 tracking-tight">Field Resolution Matrix</h3>
          <Badge className="bg-purple-50 text-purple-700 border-purple-200 text-xs rounded-full px-3 py-0.5">
            {searchQuery.trim() || showMissingOnly ? `${(searchQuery.trim() ? filteredAutomations : automations).filter((a: any) => !showMissingOnly || missingStats.missingAutoIds.has(a.id)).length} of ${automations?.length || 0}` : automations?.length || 0} Automations
          </Badge>
          <div className="relative ml-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search fields, automations..."
              className="h-9 w-72 pl-9 pr-8 text-sm rounded-full border border-slate-200 bg-slate-50 text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-400 transition-all"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {allArrayExpandKeys.length > 0 && (
            <Button variant="outline" size="sm" className="h-9 px-4 text-xs font-semibold rounded-lg border-slate-200 text-slate-700 bg-white hover:bg-slate-50 shadow-sm flex items-center gap-1.5" onClick={handleToggleAllArrays}>
              {allArraysExpanded ? <ChevronsDownUp className="h-3.5 w-3.5 text-slate-500" /> : <ChevronsUpDown className="h-3.5 w-3.5 text-slate-500" />}
              {allArraysExpanded ? 'Collapse All Arrays' : 'Expand All Arrays'}
            </Button>
          )}
          <Button
            variant={showMissingOnly ? "default" : "outline"}
            size="sm"
            className={`h-9 px-4 text-xs font-semibold rounded-lg shadow-sm flex items-center gap-1.5 ${showMissingOnly ? 'bg-orange-500 text-white hover:bg-orange-600 border-orange-500' : 'border-slate-200 text-slate-700 bg-white hover:bg-slate-50'}`}
            onClick={() => setShowMissingOnly(!showMissingOnly)}
          >
            {showMissingOnly ? 'Show All' : 'Show Missing'}
            {!showMissingOnly && missingStats.missingCount > 0 && (
              <Badge className="ml-1 bg-orange-500 text-white text-[10px] h-5 min-w-[20px] px-1 rounded-full">{missingStats.missingCount}</Badge>
            )}
            {!showMissingOnly && (
              <span className="text-slate-400 font-normal ml-1">{missingProgress}%</span>
            )}
          </Button>
          {automationJobId && showConsole && (
            <Button variant="outline" size="sm" className="h-9 px-4 text-xs font-semibold rounded-lg border-slate-200 text-slate-700 bg-white hover:bg-slate-50 shadow-sm flex items-center gap-1.5" onClick={() => setShowConsole(!showConsole)}>
              <Terminal className="h-3.5 w-3.5 text-slate-500" /> {showConsole ? 'Hide Console' : 'Show Console'}
            </Button>
          )}
          <Button variant="outline" size="sm" className="h-9 px-4 text-xs font-semibold rounded-lg border-slate-200 text-slate-700 bg-white hover:bg-slate-50 shadow-sm flex items-center gap-1.5" onClick={onRefresh}>
            <RefreshCw className="h-3.5 w-3.5 text-slate-500" /> Refresh
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
      ) : showMissingOnly && missingStats.missingCount === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center p-12 text-center bg-slate-50/50 rounded-lg border-2 border-dashed border-slate-200">
          <div className="bg-white p-6 rounded-full shadow-md mb-4 border border-slate-100">
            <CheckCircle2 className="h-10 w-10 text-emerald-400" />
          </div>
          <p className="text-lg font-medium text-slate-600">All Fields Filled</p>
          <p className="text-sm font-medium text-slate-400 mt-2 max-w-sm leading-relaxed">
            Every automation field has a value assigned. Great job!
          </p>
        </div>
      ) : searchQuery.trim() && filteredAutomations.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center p-12 text-center bg-slate-50/50 rounded-lg border-2 border-dashed border-slate-200">
          <div className="bg-white p-6 rounded-full shadow-md mb-4 border border-slate-100">
            <Search className="h-10 w-10 text-slate-300" />
          </div>
          <p className="text-lg font-medium text-slate-600">No Matching Fields</p>
          <p className="text-sm font-medium text-slate-400 mt-2 max-w-sm leading-relaxed">
            No automations or fields match "{searchQuery}". Try a different search term.
          </p>
        </div>
      ) : (
        <div className="flex-1 overflow-auto relative custom-scrollbar border rounded-lg bg-white shadow-sm">
          <table className="w-full caption-bottom text-sm border-collapse border-separate border-spacing-0 min-w-full">
            <TableHeader className="sticky top-0 z-30 text-white">
              <TableRow className="bg-custom-blue hover:bg-custom-blue">
                <TableHead className="w-12 border-b border-r sticky left-0 top-0 bg-custom-blue z-40 p-0 text-white">
                  <div className="flex items-center justify-center h-full text-sm font-medium uppercase tracking-wider">#</div>
                </TableHead>
                <TableHead className="w-[220px] border-b border-r sticky left-12 top-0 bg-custom-blue z-40 p-0 text-white">
                  <div className="flex items-center h-full px-4 text-[11px] font-medium uppercase tracking-wider cursor-pointer hover:bg-blue-700 transition-colors" onClick={() => handleSort("field-name")}>
                    Field Name
                    {sortCol === "field-name" && (sortDir === "asc" ? <ArrowUp className="ml-2 h-4 w-4" /> : <ArrowDown className="ml-2 h-4 w-4" />)}
                  </div>
                </TableHead>
                <TableHead className="w-[100px] border-b border-r sticky left-[268px] top-0 bg-custom-blue z-40 p-0 text-white">
                  <div className="flex items-center h-full px-4 text-[11px] font-medium uppercase tracking-wider cursor-pointer hover:bg-blue-700 transition-colors" onClick={() => handleSort("type")}>
                    Type
                    {sortCol === "type" && (sortDir === "asc" ? <ArrowUp className="ml-2 h-4 w-4" /> : <ArrowDown className="ml-2 h-4 w-4" />)}
                  </div>
                </TableHead>
                <TableHead className="w-[220px] border-b border-r sticky left-[368px] top-0 bg-custom-blue z-40 p-0 text-white">
                  <div className="flex items-center h-full px-4 text-[11px] font-medium uppercase tracking-wider cursor-pointer hover:bg-blue-700 transition-colors" onClick={() => handleSort("source")}>
                    Source
                    {sortCol === "source" && (sortDir === "asc" ? <ArrowUp className="ml-2 h-4 w-4" /> : <ArrowDown className="ml-2 h-4 w-4" />)}
                  </div>
                </TableHead>
                {columns.map(col => {
                  const { bgColor, Icon } = getEntityTypeConfig(col.type)
                  const colKey = String(col.id)
                  return (
                    <TableHead key={col.id} className={cn("min-w-[220px] border-b border-r top-0 p-0 text-white align-middle cursor-pointer hover:brightness-110 transition-all", bgColor)}>
                      <div className="flex flex-col items-center justify-center gap-1.5 p-3 h-full" onClick={() => handleSort(colKey)}>
                        <span className={cn("flex items-center gap-2 text-[11px] font-semibold tracking-wide text-white")}>
                          <Icon className="h-4 w-4 opacity-90 text-white" />
                          <span className="truncate max-w-[150px] text-white">{col.label}</span>
                          {sortCol === colKey && (sortDir === "asc" ? <ArrowUp className="h-3.5 w-3.5 shrink-0 opacity-80 text-white" /> : <ArrowDown className="h-3.5 w-3.5 shrink-0 opacity-80 text-white" />)}
                        </span>
                        <span className="text-[10px] font-medium uppercase tracking-wide opacity-80 text-white/95">{col.subLabel}</span>
                      </div>
                    </TableHead>
                  )
                })}
              </TableRow>
            </TableHeader>
            <TableBody>
              {(searchQuery.trim() ? filteredAutomations : automations).filter((auto: any) => {
                if (!showMissingOnly) return true
                return missingStats.missingAutoIds.has(auto.id)
              }).map((automation: any) => {
                const isExpanded = expandedAutomations.has(automation.id)
                const fields = automation.webdata || []
                const isRunning = runningAutomationId === automation.id
                const linkSources = automationLinkSources[String(automation.id)] || { stages: [], requirements: [] }
                const linkSourceCount = linkSources.stages.length + linkSources.requirements.length

                return (
                  <React.Fragment key={automation.id}>
                    {/* Automation Header Row */}
                    <TableRow
                      ref={(el) => { automationRowRefs.current[String(automation.id)] = el }}
                      className={cn(
                        "group cursor-pointer transition-colors",
                        isRunning ? "bg-purple-50/90" : "bg-slate-100/90",
                        "hover:bg-slate-200/90",
                        highlightedRowId === automation.id && "ring-2 ring-inset ring-blue-500 bg-blue-50/90 animate-pulse"
                      )}
                      onClick={() => setExpandedAutomations(prev => {
                        const next = new Set(prev)
                        if (next.has(automation.id)) next.delete(automation.id)
                        else next.add(automation.id)
                        return next
                      })}
                    >
                      {/* Sticky left: identity block, frozen the same way the field rows' # / Field Name / Type / Source columns are, so the automation name stays visible while scrolling through participant columns. */}
                      <TableCell
                        colSpan={columns.length > 0 ? 4 : totalCols}
                        style={{ position: 'sticky', left: 0, top: 0, zIndex: 20 }}
                        className={cn(
                          "py-3 px-5 border-b border-slate-300 transition-colors",
                          isRunning ? "bg-purple-100" : "bg-slate-100",
                          "group-hover:bg-slate-200",
                          highlightedRowId === automation.id && "bg-blue-100"
                        )}
                      >
                        <div className="flex items-center gap-3">
                          {isExpanded ? <ChevronDown className="h-5 w-5 text-slate-500" /> : <ChevronRight className="h-5 w-5 text-slate-500" />}
                          <div className={cn("p-1.5 rounded-md", isRunning ? "bg-purple-100 text-purple-600" : "bg-slate-200 text-slate-600")}>
                            {isRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                          </div>
                          <span className="text-[11px] font-medium uppercase tracking-wide text-slate-800">
                            {automation.name || `Automation #${automation.id}`}
                          </span>
                          <span className="text-xs text-slate-400">
                            {fields.length} field{fields.length !== 1 ? 's' : ''} · {deriveAutomationType(automation)}
                          </span>
                          {linkSourceCount > 0 && (
                            <Popover>
                              <PopoverTrigger asChild>
                                <button type="button" onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1 text-xs text-emerald-700 hover:text-emerald-800 hover:underline">
                                  <Link2 className="h-3 w-3" /> Linked from {linkSourceCount}
                                </button>
                              </PopoverTrigger>
                              <PopoverContent className="w-72 p-0" align="start" onClick={(e) => e.stopPropagation()}>
                                <Command>
                                  <CommandList>
                                    {linkSources.stages.length > 0 && (
                                      <CommandGroup heading="Stage document">
                                        {linkSources.stages.map((s: any) => (
                                          <CommandItem key={s.id} className="text-xs">{s.name}</CommandItem>
                                        ))}
                                      </CommandGroup>
                                    )}
                                    {linkSources.requirements.length > 0 && (
                                      <CommandGroup heading="Requirement">
                                        {linkSources.requirements.map((r: any) => (
                                          <CommandItem key={r.id} className="text-xs">{r.name}</CommandItem>
                                        ))}
                                      </CommandGroup>
                                    )}
                                  </CommandList>
                                </Command>
                              </PopoverContent>
                            </Popover>
                          )}
                          {isRunning && (
                            <span className="flex items-center gap-1.5 text-[10px] font-semibold text-purple-600 uppercase tracking-wide">
                              <span className="h-1.5 w-1.5 rounded-full bg-purple-500 animate-pulse" /> Agent Active
                            </span>
                          )}
                          {!isRunning && lastRunByAutomation[String(automation.id)] && (() => {
                            const lastJob = lastRunByAutomation[String(automation.id)]
                            const isFailed = lastJob.status === 'failed'
                            // A runner can report status:'completed' at the DB level while its own
                            // result payload says the underlying task wasn't actually finished (e.g.
                            // special-pass fills the form but leaves submission for manual review) -
                            // trust that self-reported outcome over the coarse DB status when present.
                            const needsReview = !isFailed && lastJob.result?.status === 'needs_review'
                            const isSuccess = !isFailed && !needsReview && lastJob.status === 'completed'
                            return (
                              <Popover>
                                <PopoverTrigger asChild>
                                  <button
                                    type="button"
                                    onClick={(e) => e.stopPropagation()}
                                    className={cn(
                                      "flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide rounded-full px-2.5 py-1 border transition-colors",
                                      isSuccess ? "text-emerald-700 bg-emerald-50 border-emerald-200 hover:bg-emerald-100" :
                                        isFailed ? "text-red-700 bg-red-50 border-red-200 hover:bg-red-100" :
                                          needsReview ? "text-amber-700 bg-amber-50 border-amber-200 hover:bg-amber-100" :
                                            "text-slate-600 bg-slate-100 border-slate-200 hover:bg-slate-200"
                                    )}
                                  >
                                    {isSuccess ? <CheckCircle2 className="h-3 w-3" /> : (isFailed || needsReview) ? <AlertCircle className="h-3 w-3" /> : <Loader2 className="h-3 w-3" />}
                                    {isSuccess ? 'Completed' : isFailed ? 'Failed' : needsReview ? 'Needs Review' : lastJob.status}
                                    <span className="opacity-60 normal-case font-normal">
                                      · {formatRelativeTime(lastJob.completed_at || lastJob.updated_at)}
                                    </span>
                                  </button>
                                </PopoverTrigger>
                                <PopoverContent className="w-80 p-4 text-xs space-y-3" align="start" onClick={(e) => e.stopPropagation()}>
                                  <div className="flex items-center justify-between">
                                    <span className="font-semibold text-slate-700 text-sm">Last Run</span>
                                    <Badge className={cn(
                                      "text-[10px] uppercase",
                                      isSuccess ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                                        isFailed ? "bg-red-50 text-red-700 border-red-200" :
                                          needsReview ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-slate-100 text-slate-600 border-slate-200"
                                    )}>
                                      {needsReview ? 'needs review' : lastJob.status}
                                    </Badge>
                                  </div>
                                  <div className="space-y-1 text-slate-500">
                                    <div>Ran by: <span className="font-medium text-slate-700">{lastJob.context?.ran_by_name || lastJob.context?.ran_by_email || 'Unknown'}</span></div>
                                    <div>Started: <span className="text-slate-700">{lastJob.started_at ? new Date(lastJob.started_at).toLocaleString() : '—'}</span></div>
                                    <div>{isFailed ? 'Failed' : 'Completed'}: <span className="text-slate-700">{lastJob.completed_at ? new Date(lastJob.completed_at).toLocaleString() : '—'}</span></div>
                                  </div>
                                  {lastJob.result?.message && (
                                    <div className={cn(
                                      "rounded p-2 border break-words",
                                      needsReview ? "text-amber-700 bg-amber-50 border-amber-100" : "text-slate-600 bg-slate-50 border-slate-100"
                                    )}>
                                      {lastJob.result.message}
                                    </div>
                                  )}
                                  {lastJob.error && (
                                    <div className="text-red-600 bg-red-50 rounded p-2 border border-red-100 break-words">{lastJob.error}</div>
                                  )}
                                  {lastJob.logs?.length > 0 && (
                                    <div className="max-h-40 overflow-y-auto border rounded bg-slate-50 p-2 font-mono text-[10px] space-y-0.5">
                                      {lastJob.logs.slice(-30).map((log: any, i: number) => (
                                        <div key={i} className={cn(
                                          log.level === 'error' ? 'text-red-600' : log.level === 'warn' ? 'text-amber-600' : 'text-slate-600'
                                        )}>
                                          {log.message}
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </PopoverContent>
                              </Popover>
                            )
                          })()}
                        </div>
                      </TableCell>

                      {/* Sticky right: run/stop action, kept reachable via sticky-right instead of sitting unreachable at the far end of a colSpan row when there are many participant columns to scroll through. */}
                      {columns.length > 0 && (
                        <TableCell
                          colSpan={columns.length}
                          style={{ position: 'sticky', top: 0, zIndex: 20 }}
                          className={cn(
                            "py-3 px-5 border-b border-slate-300 transition-colors",
                            isRunning ? "bg-purple-100" : "bg-slate-100",
                            "group-hover:bg-slate-200",
                            highlightedRowId === automation.id && "bg-blue-100"
                          )}
                        >
                          <div className="flex justify-end">
                            <div className="sticky right-4 flex items-center gap-3 w-fit">
                              {isRunning ? (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-9 px-5 text-xs font-medium text-red-600 hover:bg-red-50 hover:text-red-700 rounded-full border border-red-100 bg-white shadow-sm"
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
                      )}
                    </TableRow>

                    {/* Field Rows */}
                    {isExpanded && getSortedFields(fields).filter((field: any) => {
                      if (!showMissingOnly) return true
                      const isDoc = field.fieldType === 'document'
                      const isComputed = field.fieldType === 'computed'
                      if (isDoc || isComputed) return false
                      const isDropdownField = field.fieldType === 'dropdown'
                      const isPhoneField = field.fieldName === 'phone' || field.field_name === 'phone'
                      return columns.some((col: any) => {
                        if (isPhoneField && col.field_name !== 'phone') return false
                        if (!isFieldApplicable(field, col)) return false
                        if (!isDropdownField && !isPhoneField) return true
                        const cacheKey = `${field.variableName || field.name || field.field_name}-${col.id}`
                        const val = resolvedValues[cacheKey]
                        return !isValidValue(val)
                      })
                    }).map((field: any, fIdx: number) => {
                      const isDocument = field.fieldType === 'document'
                      const isComputed = field.fieldType === 'computed'
                      const isArray = field.fieldType === 'array'
                      const fieldKey = field.variableName || field.name || field.field_name
                      const arrayExpandKey = `${automation.id}-${fieldKey}`
                      const isArrayExpanded = isArray && expandedArrayFields.has(arrayExpandKey)
                      const arrayRows = isArrayExpanded ? mergeArrayOverrides(field, getArrayFieldData(field)) : []

                      // Computed once per row (not per participant column) since it
                      // doesn't vary by column - also feeds the Source column.
                      const mIds = field.linkedMasterFields || field.masterFieldIds || []
                      const qIds = field.linkedJobQuestionIds || []
                      const hasMultipleSources = (mIds.length + qIds.length) > 1
                      const hasDefault = !!(field.defaultValue && field.defaultValue !== 'Missing' && field.defaultValue !== '')
                      const zebraBg = fIdx % 2 === 1 ? "bg-slate-50/60" : "bg-white"

                      return (
                        <React.Fragment key={field.id || fIdx}>
                          <TableRow className={cn("group transition-colors", zebraBg, "hover:bg-slate-100/80")}>
                            <TableCell className={cn("w-12 py-0 px-0 text-center text-xs font-mono text-slate-400 border-b border-r sticky left-0 z-10 align-middle transition-colors", zebraBg, "group-hover:bg-slate-100/80")}>
                              <div className="flex items-center justify-center h-full font-medium">{fIdx + 1}</div>
                            </TableCell>

                            <TableCell className={cn("w-[220px] py-0 px-4 border-b border-r sticky left-12 z-10 align-middle transition-colors", zebraBg, "group-hover:bg-slate-100/80")}>
                              <div className="flex items-center gap-2 h-full py-3">
                                {isArray && (
                                  <button
                                    className="p-1 hover:bg-slate-100 rounded-full transition-colors shrink-0"
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
                                  <HighlightText text={getFieldLabel(field)} query={searchQuery} />
                                </span>
                              </div>
                            </TableCell>

                            <TableCell className={cn("w-[100px] py-0 px-4 border-b border-r sticky left-[268px] z-10 align-middle transition-colors", zebraBg, "group-hover:bg-slate-100/80")}>
                              <div className="flex items-center h-full py-3">
                                <span className="text-[11px] font-medium text-slate-500 capitalize truncate">{field.fieldType || 'text'}</span>
                              </div>
                            </TableCell>

                            <TableCell className={cn("w-[220px] py-0 px-4 border-b border-r sticky left-[368px] z-10 align-middle transition-colors", zebraBg, "group-hover:bg-slate-100/80")}>
                              <div className="flex flex-col justify-center h-full py-2 gap-0.5">
                                {field.customFieldSource ? (
                                  <span className="text-[10px] font-semibold text-blue-600 truncate">{field.customFieldSource}</span>
                                ) : (
                                  <span className="text-slate-300 italic">No source</span>
                                )}
                              </div>
                            </TableCell>

                            {columns.map(col => {
                              const applicable = isFieldApplicable(field, col)
                              const cacheKey = `${field.variableName || field.name || field.field_name}-${col.id}`
                              const val = resolvedValues[cacheKey]
                              const isResolving = resolving[cacheKey]
                              const isMissing = !isValidValue(val)
                              const isEditing = editingCell?.field?.variableName === (field.variableName || field.name || field.field_name) && editingCell?.col?.id === col.id

                              const ctxForCol: FieldResolutionContext = {
                                sourceData: fieldSourceDataCache, jobFields: jobFieldsRecord,
                                webData: [{ automationId: String(field.automation_id || ""), fields: [field] }],
                                selectedAutomationId: String(field.automation_id || ""),
                                masterFieldComputedValues: fieldMasterComputedCache,
                                relationshipData: relationshipData[0],
                                taskId: String(task?.id || ""),
                                currentIndividualId: col.type === 'company' ? String(task?.individual_id || "") : String(col.id),
                                task,
                              }
                              const targetEntityId = !hasDefault && hasMultipleSources ? resolveTargetEntityIdImpl(field, ctxForCol) : null

                              // The specific master field currently being edited - whichever source
                              // was clicked in the popover, or the primary one for a single-source
                              // field - determines whether the edit widget is a dropdown and which
                              // options it offers, instead of always assuming the first linked field.
                              const editingMasterId = isEditing ? (editingCell?.masterFieldId ?? mIds[0]) : null
                              const editingMasterField = editingMasterId != null ? jobFieldsRecord[String(editingMasterId)] : null
                              const editingOptions = Array.isArray(editingMasterField?.options)
                                ? editingMasterField.options.map((o: any) => typeof o === 'string' ? { label: o, value: o } : o)
                                : []
                              const isEditingDropdown = editingOptions.length > 0

                              return (
                                <TableCell key={col.id} className={cn("p-0 border-b border-r align-middle transition-colors min-w-[220px]", zebraBg, "group-hover:bg-slate-100/80")}>
                                  {!applicable ? (
                                    <div className="flex h-full items-center justify-center p-3">
                                      <span className="text-xs font-medium text-slate-300 italic">N/A</span>
                                    </div>
                                  ) : (
                                    <div className="flex items-center justify-start h-full px-4">
                                      {isResolving ? (
                                        <Loader2 className="h-5 w-5 animate-spin text-purple-500" />
                                      ) : isDocument ? (
                                        !docStatusLoaded ? (
                                          <Loader2 className="h-4 w-4 animate-spin text-slate-300" />
                                        ) : (
                                          <div className="flex items-center gap-2">
                                            {getDocsForCol(field.linkedKycDocuments, col).length > 0 ? (
                                              <button
                                                className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 hover:underline disabled:opacity-60"
                                                onClick={() => handlePreviewDocumentField(field, col)}
                                                disabled={docPreviewLoading === `${field.variableName || field.name}-${col.id}`}
                                                title="Preview linked document"
                                              >
                                                {docPreviewLoading === `${field.variableName || field.name}-${col.id}` ? (
                                                  <Loader2 className="h-3 w-3 animate-spin" />
                                                ) : (
                                                  <Eye className="h-3 w-3" />
                                                )}
                                                Preview
                                              </button>
                                            ) : (
                                              <span className="text-sm font-medium text-red-600">Missing</span>
                                            )}
                                            {field.linkedRequirementId && (
                                              <button
                                                type="button"
                                                className="text-green-600 hover:text-green-700 shrink-0"
                                                onClick={() => handleGoToRequirement(field.linkedRequirementId)}
                                                title="Go to linked requirement - upload/manage this document there"
                                              >
                                                <Shield className="h-3.5 w-3.5" />
                                              </button>
                                            )}
                                          </div>
                                        )
                                      ) : isComputed ? (
                                        <span className="text-xs text-slate-400 italic">Computed</span>
                                      ) : isArray ? (
                                        <span className="text-xs text-slate-400 italic">See rows below</span>
                                      ) : hasDefault ? (
                                        <div className="flex gap-1.5 items-center justify-start w-full">
                                          {/* Native title, not a Radix Tooltip: one asChild tooltip per matrix cell
                                              hit Radix compose-refs 1.1.1's ref-churn loop under React 19
                                              ("Maximum update depth exceeded"). */}
                                          <span title="Preset by automation configuration." className="cursor-help shrink-0">
                                            <Lock className="h-3.5 w-3.5 text-slate-400" />
                                          </span>
                                          <span className="text-sm font-medium text-slate-600 truncate">{String(field.defaultValue)}</span>
                                        </div>
                                      ) : isEditing ? (
                                        <div className="flex gap-2 items-center w-full py-1 px-1">
                                          {isEditingDropdown ? (
                                            <SearchableSelect
                                              value={editValue}
                                              onValueChange={(v) => setEditValue(v)}
                                              options={editingOptions}
                                              placeholder="Select..."
                                              className="flex-1 min-w-0"
                                              buttonClassName="h-11 text-sm w-full bg-white"
                                              disabled={isSavingEdit}
                                            />
                                          ) : (
                                            <Input
                                              value={editValue}
                                              onChange={(e) => setEditValue(e.target.value)}
                                              className="h-11 text-sm w-full min-w-0 flex-1"
                                              autoFocus
                                              disabled={isSavingEdit}
                                              onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(isEditingDropdown, editingOptions); if (e.key === 'Escape') cancelEditing(); }}
                                            />
                                          )}
                                          <Button variant="ghost" size="sm" disabled={isSavingEdit} className="h-9 w-9 p-0 text-green-600 hover:bg-green-50 rounded-full shrink-0" onClick={() => saveEdit(isEditingDropdown, editingOptions)}>
                                            {isSavingEdit ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                                          </Button>
                                          <Button variant="ghost" size="sm" disabled={isSavingEdit} className="h-9 w-9 p-0 text-slate-400 hover:bg-red-50 hover:text-red-500 rounded-full shrink-0" onClick={cancelEditing}>
                                            <X className="h-4 w-4" />
                                          </Button>
                                        </div>
                                      ) : val !== undefined ? (
                                        hasMultipleSources ? (
                                          <Popover>
                                            <PopoverTrigger asChild>
                                              <button
                                                type="button"
                                                onClick={(e) => e.stopPropagation()}
                                                className={cn(
                                                  "flex items-center gap-1 max-w-full hover:bg-slate-50 rounded px-1 -mx-1",
                                                  isMissing ? "text-red-600 font-medium" : "text-slate-800"
                                                )}
                                              >
                                                <span className="text-sm truncate max-w-[280px]">{isMissing ? 'Missing' : String(cleanFieldValue(val))}</span>
                                                <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                                              </button>
                                            </PopoverTrigger>
                                            <PopoverContent className="w-96 p-0" align="start" onClick={(e) => e.stopPropagation()}>
                                              <div className="p-3 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
                                                <span className="text-xs font-semibold text-slate-600">Linked Sources</span>
                                                <span className="text-xs text-slate-500">{field.sourceLogic === 'all' ? 'Merge All' : 'Priority Logic'}</span>
                                              </div>
                                              <div className="p-1.5 space-y-1 bg-white max-h-64 overflow-y-auto">
                                                {mIds.map((mid: any, idx: number) => {
                                                  const mDef = jobFieldsRecord[String(mid)]
                                                  const sourceVal = targetEntityId != null ? getFieldValueImpl(String(mid), String(targetEntityId), 0, 'latest', false, ctxForCol) : 'Missing'
                                                  const sourceValid = isValidValue(sourceVal)
                                                  return (
                                                    <div key={`m-${mid}`} className="flex items-center justify-between p-2 hover:bg-slate-50 rounded-md border border-transparent group/src transition-all">
                                                      <div className="flex flex-col min-w-0">
                                                        <span className="text-[10px] font-medium text-slate-500 mb-0.5">DB Field {idx + 1}</span>
                                                        <span className="text-sm text-slate-800 truncate">{mDef?.label || `Field ${mid}`}</span>
                                                        <span className="text-xs text-slate-400 truncate mt-0.5">{sourceValid ? sourceVal : 'Empty'}</span>
                                                      </div>
                                                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 opacity-0 group-hover/src:opacity-100 text-blue-600 hover:bg-blue-50 rounded-md shrink-0" onClick={() => startEditing(field, col, sourceValid ? sourceVal : val, mid)}>
                                                        <Edit3 className="h-3.5 w-3.5" />
                                                      </Button>
                                                    </div>
                                                  )
                                                })}
                                                {qIds.map((qid: any, idx: number) => {
                                                  const taskRecord = fieldSourceDataCache['tm_tasks']?.[String(task?.id || '')]
                                                  const answers = taskRecord?.job_specific_answers || {}
                                                  const sourceVal = answers[String(qid)] ?? answers[Number(qid)]
                                                  const sourceValid = isValidValue(sourceVal)
                                                  return (
                                                    <div key={`q-${qid}`} className="flex items-center justify-between p-2 hover:bg-slate-50 rounded-md border border-transparent group/src transition-all">
                                                      <div className="flex flex-col min-w-0">
                                                        <span className="text-[10px] font-medium text-slate-500 mb-0.5">Question {idx + 1}</span>
                                                        <span className="text-sm text-slate-800 truncate">Job Question #{qid}</span>
                                                        <span className="text-xs text-slate-400 truncate mt-0.5">{sourceValid ? sourceVal : 'Empty'}</span>
                                                      </div>
                                                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 opacity-0 group-hover/src:opacity-100 text-blue-600 hover:bg-blue-50 rounded-md shrink-0" onClick={() => startEditing(field, col, sourceValid ? sourceVal : val, null, qid)}>
                                                        <Edit3 className="h-3.5 w-3.5" />
                                                      </Button>
                                                    </div>
                                                  )
                                                })}
                                              </div>
                                            </PopoverContent>
                                          </Popover>
                                        ) : isMissing ? (
                                          <div className="flex gap-1.5 items-center justify-between w-full group/cell">
                                            <span className="text-sm font-medium text-red-600 truncate">Missing</span>
                                            <button
                                              className="text-slate-400 hover:text-blue-600 opacity-0 group-hover/cell:opacity-100 transition-opacity shrink-0"
                                              onClick={() => startEditing(field, col, val, mIds[0], qIds[0])}
                                              title="Edit"
                                            >
                                              <Edit3 className="h-3.5 w-3.5" />
                                            </button>
                                          </div>
                                        ) : (
                                          <div className="flex gap-1.5 items-center justify-between w-full group/cell">
                                            <span className="text-sm text-slate-800 truncate">{String(cleanFieldValue(val))}</span>
                                            <button
                                              className="text-slate-400 hover:text-blue-600 opacity-0 group-hover/cell:opacity-100 transition-opacity shrink-0"
                                              onClick={() => startEditing(field, col, val, mIds[0], qIds[0])}
                                              title="Edit"
                                            >
                                              <Edit3 className="h-3.5 w-3.5" />
                                            </button>
                                          </div>
                                        )
                                      ) : val === undefined && applicable ? (
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className="h-8 px-4 text-sm font-medium text-slate-500 hover:bg-slate-100 hover:text-blue-600"
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

                          {/* Array Field Data - one row per array item, laid out across the
                            same participant columns as scalar fields (column-wise), instead
                            of a separate entity-rows mini-table, so array data reads the
                            same way as everything else in the matrix. */}
                          {isArray && isArrayExpanded && (field.arrayItems || []).length === 0 && (
                            <TableRow className="bg-indigo-50/20">
                              <TableCell colSpan={totalCols} className="py-3 px-5 border-b text-sm text-slate-400 italic">
                                No sub-fields configured for this array.
                              </TableCell>
                            </TableRow>
                          )}
                          {isArray && isArrayExpanded && (field.arrayItems || []).map((item: any, itemIdx: number) => {
                            const isDocumentItem = item.type === 'document'
                            const itemMIds = item.linkedMasterFields || item.masterFieldIds || []
                            const itemQIds = item.linkedJobQuestionIds || []
                            const itemHasMultipleSources = (itemMIds.length + itemQIds.length) > 1
                            const itemHasDefault = !!(item.defaultValue && item.defaultValue !== 'Missing' && item.defaultValue !== '')

                            return (
                              <TableRow key={`${field.id || fIdx}-arr-${itemIdx}`} className="group bg-indigo-50/20 hover:bg-indigo-50/40 transition-colors">
                                <TableCell className="w-12 py-0 px-0 text-center text-[10px] font-mono text-slate-400 border-b border-r sticky left-0 bg-indigo-50/20 group-hover:bg-indigo-50/40 z-10 align-middle">
                                  <div className="flex items-center justify-center h-full">{fIdx + 1}.{itemIdx + 1}</div>
                                </TableCell>
                                <TableCell className="w-[220px] py-2 px-4 pl-8 border-b border-r sticky left-12 bg-indigo-50/20 group-hover:bg-indigo-50/40 z-10 align-middle relative">
                                  <div className="absolute left-4 top-1/2 w-3 h-px bg-indigo-300" />
                                  <span className="text-xs font-medium text-slate-600 truncate"><HighlightText text={getFieldLabel(item)} query={searchQuery} /></span>
                                </TableCell>

                                <TableCell className="w-[100px] py-0 px-4 border-b border-r sticky left-[268px] bg-indigo-50/20 group-hover:bg-indigo-50/40 z-10 align-middle">
                                  <span className="text-[11px] font-medium text-slate-500 capitalize truncate">{item.type || 'text'}</span>
                                </TableCell>

                                <TableCell className="w-[220px] py-0 px-4 border-b border-r sticky left-[368px] bg-indigo-50/20 group-hover:bg-indigo-50/40 z-10 align-middle">
                                  <div className="text-xs text-slate-500 truncate">
                                    {itemHasDefault ? (
                                      <span className="flex items-center gap-1"><Lock className="h-3 w-3 text-slate-400 shrink-0" /> Default value</span>
                                    ) : isDocumentItem ? (
                                      <span className="truncate">
                                        {(item.linkedKycDocuments || []).length} doc type{(item.linkedKycDocuments || []).length !== 1 ? 's' : ''}
                                        {item.linkedRequirementId ? ' · requirement linked' : ''}
                                      </span>
                                    ) : (itemMIds.length > 0 || itemQIds.length > 0) ? (
                                      <span className="truncate">
                                        {[itemMIds.length > 0 ? `${itemMIds.length} DB` : null, itemQIds.length > 0 ? `${itemQIds.length} Question` : null].filter(Boolean).join(' + ')}
                                      </span>
                                    ) : (
                                      <span className="text-slate-300 italic">No source</span>
                                    )}
                                  </div>
                                </TableCell>

                                {columns.map(col => {
                                  const row = arrayRows.find((r: any) => String(r.entityId) === String(col.id))
                                  const cellVal = row ? row[item.variableName] : undefined
                                  const isItemMissing = !isValidValue(cellVal)
                                  const overrideKey = getArrayOverrideKey(field, col.id)
                                  const isCellEditing = editingArrayCell?.overrideKey === overrideKey && editingArrayCell?.itemVar === item.variableName
                                  const itemMasterField = isCellEditing ? jobFieldsRecord[String(editingArrayCell.masterFieldId)] : null
                                  const itemOptions = Array.isArray(itemMasterField?.options)
                                    ? itemMasterField.options.map((o: any) => typeof o === 'string' ? { label: o, value: o } : o)
                                    : []
                                  const isItemDropdown = itemOptions.length > 0
                                  const docPreviewKey = `${item.variableName || item.name}-${col.id}`

                                  return (
                                    <TableCell key={col.id} className="p-0 border-b border-r align-middle bg-white group-hover:bg-indigo-50/10 transition-colors min-w-[220px]">
                                      {!row ? (
                                        <div className="flex h-full items-center justify-center p-3">
                                          <span className="text-xs font-medium text-slate-300 italic">N/A</span>
                                        </div>
                                      ) : (
                                        <div className="flex items-center justify-start h-full px-4 py-2">
                                          {isDocumentItem ? (
                                            !docStatusLoaded ? (
                                              <Loader2 className="h-4 w-4 animate-spin text-slate-300" />
                                            ) : (
                                              <div className="flex items-center gap-2">
                                                {getDocsForCol(item.linkedKycDocuments, col).length > 0 ? (
                                                  <button
                                                    className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 hover:underline disabled:opacity-60"
                                                    onClick={() => handlePreviewDocumentField(item, col)}
                                                    disabled={docPreviewLoading === docPreviewKey}
                                                    title="Preview linked document"
                                                  >
                                                    {docPreviewLoading === docPreviewKey ? <Loader2 className="h-3 w-3 animate-spin" /> : <Eye className="h-3 w-3" />}
                                                    Preview
                                                  </button>
                                                ) : (
                                                  <span className="text-sm font-medium text-red-600">Missing</span>
                                                )}
                                                {item.linkedRequirementId && (
                                                  <button
                                                    type="button"
                                                    className="text-green-600 hover:text-green-700 shrink-0"
                                                    onClick={() => handleGoToRequirement(item.linkedRequirementId)}
                                                    title="Go to linked requirement - upload/manage this document there"
                                                  >
                                                    <Shield className="h-3.5 w-3.5" />
                                                  </button>
                                                )}
                                              </div>
                                            )
                                          ) : itemHasDefault ? (
                                            <div className="flex gap-1.5 items-center justify-start w-full">
                                              <span title="Preset by automation configuration." className="cursor-help shrink-0">
                                                <Lock className="h-3.5 w-3.5 text-slate-400" />
                                              </span>
                                              <span className="text-sm font-medium text-slate-600 truncate">{String(item.defaultValue)}</span>
                                            </div>
                                          ) : isCellEditing ? (
                                            <div className="flex gap-2 items-center w-full py-1 px-1">
                                              {isItemDropdown ? (
                                                <SearchableSelect
                                                  value={arrayEditValue}
                                                  onValueChange={(v) => setArrayEditValue(v)}
                                                  options={itemOptions}
                                                  placeholder="Select..."
                                                  className="flex-1 min-w-0"
                                                  buttonClassName="h-11 text-sm w-full bg-white"
                                                  disabled={isSavingArrayEdit}
                                                />
                                              ) : (
                                                <Input
                                                  value={arrayEditValue}
                                                  onChange={(e) => setArrayEditValue(e.target.value)}
                                                  className="h-11 text-sm w-full min-w-0 flex-1"
                                                  autoFocus
                                                  disabled={isSavingArrayEdit}
                                                  onKeyDown={(e) => { if (e.key === 'Enter') saveArrayCellEdit(isItemDropdown, itemOptions); if (e.key === 'Escape') cancelEditingArrayCell(); }}
                                                />
                                              )}
                                              <Button variant="ghost" size="sm" disabled={isSavingArrayEdit} className="h-9 w-9 p-0 text-green-600 hover:bg-green-50 rounded-full shrink-0" onClick={() => saveArrayCellEdit(isItemDropdown, itemOptions)}>
                                                {isSavingArrayEdit ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                                              </Button>
                                              <Button variant="ghost" size="sm" disabled={isSavingArrayEdit} className="h-9 w-9 p-0 text-slate-400 hover:bg-red-50 hover:text-red-500 rounded-full shrink-0" onClick={cancelEditingArrayCell}>
                                                <X className="h-4 w-4" />
                                              </Button>
                                            </div>
                                          ) : itemHasMultipleSources ? (
                                            <Popover>
                                              <PopoverTrigger asChild>
                                                <button
                                                  type="button"
                                                  onClick={(e) => e.stopPropagation()}
                                                  className={cn(
                                                    "flex items-center gap-1 max-w-full hover:bg-slate-50 rounded px-1 -mx-1",
                                                    isItemMissing ? "text-red-600 font-medium" : "text-slate-800"
                                                  )}
                                                >
                                                  <span className="text-sm truncate max-w-[280px]">{isItemMissing ? 'Missing' : String(cellVal)}</span>
                                                  <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                                                </button>
                                              </PopoverTrigger>
                                              <PopoverContent className="w-96 p-0" align="start" onClick={(e) => e.stopPropagation()}>
                                                <div className="p-3 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
                                                  <span className="text-xs font-semibold text-slate-600">Array Sources</span>
                                                  <span className="text-xs text-slate-500">{item.sourceLogic === 'all' ? 'Merge All' : 'Priority Logic'}</span>
                                                </div>
                                                <div className="p-1.5 space-y-1 bg-white max-h-64 overflow-y-auto">
                                                  {itemMIds.map((mid: any, idx: number) => {
                                                    const mDef = jobFieldsRecord[String(mid)]
                                                    const sourceVal = getFieldValueImpl(String(mid), String(col.id), 0, 'latest', false, buildColCtx(field, col))
                                                    const sourceValid = isValidValue(sourceVal)
                                                    return (
                                                      <div key={`am-${mid}`} className="flex items-center justify-between p-2 hover:bg-slate-50 rounded-md border border-transparent group/src transition-all">
                                                        <div className="flex flex-col min-w-0">
                                                          <span className="text-[10px] font-medium text-slate-500 mb-0.5">Source {idx + 1}</span>
                                                          <span className="text-sm text-slate-800 truncate">{mDef?.label || `Field ${mid}`}</span>
                                                          <span className="text-xs text-slate-400 truncate mt-0.5">{sourceValid ? sourceVal : 'Empty'}</span>
                                                        </div>
                                                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 opacity-0 group-hover/src:opacity-100 text-blue-600 hover:bg-blue-50 rounded-md shrink-0" onClick={() => startEditingArrayCell(field, col.id, item, sourceValid ? sourceVal : cellVal, mid)}>
                                                          <Edit3 className="h-3.5 w-3.5" />
                                                        </Button>
                                                      </div>
                                                    )
                                                  })}
                                                </div>
                                              </PopoverContent>
                                            </Popover>
                                          ) : (
                                            <div className="flex gap-1.5 items-center justify-between w-full group/cell">
                                              <span className={cn("text-sm truncate", isItemMissing ? "text-red-600 font-medium" : "text-slate-800")}>
                                                {isItemMissing ? 'Missing' : String(cellVal)}
                                              </span>
                                              <button
                                                className="text-slate-400 hover:text-blue-600 opacity-0 group-hover/cell:opacity-100 transition-opacity shrink-0"
                                                onClick={() => startEditingArrayCell(field, col.id, item, cellVal, itemMIds[0], itemQIds[0])}
                                                title="Edit"
                                              >
                                                <Edit3 className="h-3.5 w-3.5" />
                                              </button>
                                            </div>
                                          )}
                                        </div>
                                      )}
                                    </TableCell>
                                  )
                                })}
                              </TableRow>
                            )
                          })}
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
          </table>
        </div>
      )}

      {/* Document Field Preview Modal */}
      {docPreviewData && (
        <Dialog open={docPreviewOpen} onOpenChange={setDocPreviewOpen}>
          <DialogContent className="max-w-[90vw] w-full max-h-[90vh] flex flex-col p-0 overflow-hidden">
            <div className="flex-1 overflow-y-auto p-6 bg-slate-50">
              {docPreviewData.documents.map((doc: any) => (
                <ExtractionPreview
                  key={doc.id}
                  documentName={doc.name}
                  extractedData={doc.extractedData}
                  fields={doc.fields}
                  fileUrl={doc.fileUrl}
                  expanded={true}
                  showSaveButton={false}
                  onDialogClose={() => setDocPreviewOpen(false)}
                />
              ))}
            </div>
          </DialogContent>
        </Dialog>
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