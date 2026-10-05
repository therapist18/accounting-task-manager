// @ts-nocheck
"use client"

import React, { useState, useMemo, useCallback, useEffect } from "react"
import { useRouter } from "next/navigation"
import {
  CheckCircle2, AlertCircle, UploadCloud, Eye, FileText, Lock, Loader2,
  ChevronDown, ChevronRight, Trash2, RefreshCw, FileUp, XCircle, User,
  Briefcase, UserCheck, Users2, HeartPulse, Send, Search, AlertTriangle, Check, X, ArrowUpDown, ArrowUp, ArrowDown, HelpCircle,
  Calendar, Plus, Minus, FileType, Zap, Wand2, Layers, BarChartHorizontal, MoreHorizontal, Download, ChevronsUpDown, ChevronsDownUp, Clock, Ban, ListChecks
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  TAB_LIST_CLASS, TAB_TRIGGER_CLASS, COUNT_BADGE_CLASS, URGENT_BADGE_CLASS,
  PILL_BUTTON_CLASS, PILL_BUTTON_ACTIVE_CLASS, PRIMARY_PILL_BUTTON_CLASS,
} from "../../../emails/components/shared"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { supabase } from "@/lib/supabase/client"
import { toast } from "sonner"
import { REQUIREMENTS_LOCK_STAGE_IDS } from "../../utils/taskManagerData"
import { getLatestDocumentExpiryDate } from "../../utils/automationComputedFunctions"
import { resolveTargetEntityIdImpl, resolveVariableValueImpl, type FieldResolutionContext } from "../../utils/fieldResolution"
import { resolveAutomationFieldData } from "../../../tasks-requirements/utils/resolveAutomationFieldData"
import { isTemplateEligible, fetchMasterFields, buildTemplateGenerationInfo } from "../../../tasks-requirements/utils/templateGenerationData"
import { resolveTemplatePlaceholders } from "../../../tasks-requirements/TemplateGenerationDialog"
import { UploadModal } from "@/app/generic-components/UploadModal"
import { ReviewSubmissionDialog } from "../../../tasks-requirements/components/ReviewSubmissionDialog"
import { SendRequirementsDialog } from "../../../tasks-requirements/components/SendRequirementsDialog"
import { ExtractionPreview } from "@/components/ExtractionPreview"
import type { JobWorkspaceData } from "../fetchJobWorkspaceData"

interface RequirementsTabProps {
  data: JobWorkspaceData
  onRefresh?: () => void
  autoOpenSendDialog?: boolean
  highlightRequirementId?: string | number
}

interface ColDef {
  type: string
  id: number | string
  label: string
  subLabel: string
  roles?: string[]
  priority: number
}

const CATEGORY_ORDER = ["general", "processing", "issuance", "other"]
const CATEGORY_LABELS: Record<string, string> = {
  general: "General Requirements",
  processing: "Processing Requirements",
  issuance: "Issuance Requirements",
  other: "Other Requirements",
}

function getLockState(task: any) {
  const stages = task?.stages || {}
  const done = (id: string) => stages[id]?.status === "completed"
  return {
    processingLocked: done(REQUIREMENTS_LOCK_STAGE_IDS.PROCESSING) && !done(REQUIREMENTS_LOCK_STAGE_IDS.DEFERRED),
    issuanceLocked: done(REQUIREMENTS_LOCK_STAGE_IDS.ISSUANCE),
  }
}

function getLatestDoc(docs: any[]) {
  if (!docs || docs.length === 0) return null
  return docs.reduce((prev, curr) =>
    new Date(curr.created_at || 0) > new Date(prev.created_at || 0) ? curr : prev
  )
}

function isSectionLocked(task: any, category: string) {
  const { processingLocked, issuanceLocked } = getLockState(task)
  if (category === "processing") return processingLocked
  if (category === "issuance") return issuanceLocked
  return false
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

function checkApplicability(colType: string, requirement: any): boolean {
  const allowedTypes = requirement.entityTypes || (requirement.applicantType ? [requirement.applicantType] : [])
  if (!allowedTypes || allowedTypes.length === 0) return true
  return allowedTypes.includes(colType)
}

export function buildParticipantColumns(task: any): ColDef[] {
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

export function getCellStatus(req: any, col: ColDef, docsByInd: Record<string, any[]>, allCompanyDocs: Record<string, any[]>) {
  if (!checkApplicability(col.type, req)) return { type: "na" as const, docs: [] }

  const docIds = req.document_ids || (req.document_id ? [req.document_id] : [])
  if (!docIds.length) return { type: "na" as const, docs: [] }

  let found: any[] = []
  if (col.type === "company") {
    found = (allCompanyDocs[col.id] || []).filter((d: any) => docIds.includes(d.document_id))
  } else {
    found = (docsByInd[col.id] || []).filter((d: any) => docIds.includes(d.document_id))
  }

  return { type: found.length > 0 ? "view" as const : "upload" as const, docs: found }
}

type StatusTab = "all" | "uploaded" | "missing" | "expired" | "na"

const STATUS_TABS: { value: StatusTab; label: string; description: string; Icon: any; iconClass: string }[] = [
  { value: "all", label: "All", description: "Every requirement", Icon: ListChecks, iconClass: "text-slate-500" },
  { value: "uploaded", label: "Complete", description: "Every applicable participant has the document", Icon: CheckCircle2, iconClass: "text-emerald-600" },
  { value: "missing", label: "Missing", description: "At least one applicable participant has no document", Icon: AlertCircle, iconClass: "text-amber-600" },
  { value: "expired", label: "Expired / Expiring", description: "At least one document is expired or expiring within 30 days", Icon: Clock, iconClass: "text-red-600" },
  { value: "na", label: "N/A", description: "No participant on this task needs the document", Icon: Ban, iconClass: "text-slate-400" },
]

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

function getDocTypeDisplay(req: any, kycDocsMap: Map<string, any>) {
  const docIds = req.document_ids || (req.document_id ? [req.document_id] : [])
  if (docIds.length === 0) return null

  const docTypes = docIds.map((id: string) => kycDocsMap.get(id)).filter(Boolean)
  if (docTypes.length === 0) return null

  const uniqueNames = [...new Set(docTypes.map((d: any) => d.display_name || d.name))]
  const isComposite = uniqueNames.length > 1

  return {
    primary: docTypes[0],
    allNames: uniqueNames,
    isComposite,
    count: docIds.length
  }
}

function getDocDataForReq(req: any, col: ColDef, docsByInd: Record<string, any[]>, allCompanyDocs: Record<string, any[]>) {
  const docIds = req.document_ids || (req.document_id ? [req.document_id] : [])
  if (!docIds.length) return null

  let docs: any[] = []
  if (col.type === "company") {
    docs = (allCompanyDocs[col.id] || []).filter((d: any) => docIds.includes(d.document_id))
  } else {
    docs = (docsByInd[col.id] || []).filter((d: any) => docIds.includes(d.document_id))
  }

  if (docs.length === 0) return null
  return docs.reduce((prev, curr) =>
    new Date(curr.created_at || 0) > new Date(prev.created_at || 0) ? curr : prev
  )
}

export function RequirementsTab({ data, onRefresh, autoOpenSendDialog, highlightRequirementId }: RequirementsTabProps) {
  const { task, kycDocsMap, documentsByIndividual, allDocuments, allCompanyDocuments } = data
  const router = useRouter()
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(CATEGORY_ORDER))
  const [expandedRequirements, setExpandedRequirements] = useState<Set<string>>(new Set())
  const [expandedComposites, setExpandedComposites] = useState<Set<string>>(new Set())
  const [uploadModalOpen, setUploadModalOpen] = useState(false)
  const [selectedDocForUpload, setSelectedDocForUpload] = useState<any>(null)
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false)
  const [previewDocument, setPreviewDocument] = useState<any>(null)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [isSendRequirementsOpen, setIsSendRequirementsOpen] = useState(false)
  const [highlightedRowId, setHighlightedRowId] = useState<string | number | null>(null)
  const requirementRowRefs = React.useRef<Record<string, HTMLTableRowElement | null>>({})
  useEffect(() => {
    if (autoOpenSendDialog) setIsSendRequirementsOpen(true)
  }, [autoOpenSendDialog])
  const [searchQuery, setSearchQuery] = useState("")
  const [templateMasterFields, setTemplateMasterFields] = useState<Map<number, any> | null>(null)
  const [templateProgress, setTemplateProgress] = useState<Record<string, { filled: number; total: number } | 'loading'>>({})


  useEffect(() => {
    fetchMasterFields().then(setTemplateMasterFields)
  }, [])

  const templateEligibleReqs = useMemo(() => {
    if (!task?.requirements) return []
    return task.requirements.filter((r: any) => {
      const hasTemplateExplicitly = r.hasTemplate === true || String(r.hasTemplate) === 'true'
      if (!hasTemplateExplicitly) return false
      const docMeta = kycDocsMap.get(r.document_id || r.document_ids?.[0])
      return isTemplateEligible(r, docMeta)
    })
  }, [task, kycDocsMap])

  const resolveTemplateEntityForReq = useCallback((req: any) => {
    const entityTypes = req.entityTypes || (req.applicantType ? [req.applicantType] : [])

    // Match against the same participant columns the Requirements table itself
    // uses (director/shareholder/dependant/understudy/sponsor/etc.), not just
    // company vs. principal - a requirement scoped to e.g. ["director"] has no
    // "principal" participant to fall back to when the task only has a director.
    if (entityTypes.length > 0) {
      const matchingCol = buildParticipantColumns(task).find((c: ColDef) => entityTypes.includes(c.type))
      if (matchingCol) return { colType: matchingCol.type, colId: matchingCol.id }
    }

    if (entityTypes.includes('company')) {
      let companyId = task.company_id
      if (!companyId && task.participants_details) {
        companyId = task.participants_details.find((p: any) => p.type === 'company')?.id
      }
      if (!companyId && task.applicant_details?.type === 'company') companyId = task.applicant_details.id
      return { colType: 'company', colId: companyId }
    }
    const principalPart = task.participants_details?.find((p: any) =>
      p.type === 'individual' && (Array.isArray(p.role) ? p.role.includes('principal') : p.role === 'principal')
    )
    const colId = principalPart?.id || (task.applicant_details?.type === 'individual' ? task.applicant_details.id : task.individual_id)
    return { colType: 'principal', colId }
  }, [task])
  
  useEffect(() => {
    if (!templateMasterFields || templateEligibleReqs.length === 0 || !task) return
    let cancelled = false
    templateEligibleReqs.forEach(async (req: any) => {
      const reqKey = String(req.id)
      const docId = req.document_id || req.document_ids?.[0]
      const docMeta = docId ? kycDocsMap.get(docId) : null
      if (!docId || !docMeta) return
      const { colType, colId } = resolveTemplateEntityForReq(req)
      if (!colId) return
      try {
        const info = await buildTemplateGenerationInfo({ document: docMeta }, task, colType, colId, templateMasterFields, task.job_level, req.selectedTemplateId)
        if (cancelled) return
        if (!info?.template) {
          setTemplateProgress(prev => ({ ...prev, [reqKey]: { filled: 0, total: 0 } }))
          return
        }
        const { filled, total } = resolveTemplatePlaceholders(info.template, {
          relationshipData: info.relationshipData,
          sourceDataCache: info.sourceDataCache,
          masterFields: info.masterFields,
          entityIdMap: info.entityIdMap,
          extractedData: info.extractedData,
          companyData: info.companyData,
          task: info.task,
        })
        if (!cancelled) setTemplateProgress(prev => ({ ...prev, [reqKey]: { filled, total } }))
      } catch (err) {
        console.error('[RequirementsTab] Error computing template progress for', req.name, err)
      }
    })
    return () => { cancelled = true }
  }, [templateMasterFields, templateEligibleReqs, task, kycDocsMap, resolveTemplateEntityForReq])

  const [jobFieldsRecord, setJobFieldsRecord] = useState<Record<string, any>>({})
  const [fieldSourceDataCache, setFieldSourceDataCache] = useState<Record<string, Record<string, any>>>({})
  const [fieldMasterComputedCache, setFieldMasterComputedCache] = useState<Record<string, any>>({})
  const [documentStatusCache, setDocumentStatusCache] = useState<Map<string, any>>(new Map())
  const lockState = useMemo(() => getLockState(task), [task])
  const columns = useMemo(() => buildParticipantColumns(task), [task])
  const clientDraft = task?.registry_metadata?.client_requirements_draft
  const automationWebdataMap = useMemo(() => {
    const map: Record<string, any> = {}
      ; (data.automations || []).forEach(auto => {
        if (auto.webdata?.length > 0) map[auto.id] = { name: auto.name || 'Unknown', webdata: auto.webdata }
      })
    return map
  }, [data.automations])

  const allCompanyDocumentsMap = useMemo(() => {
    const map: Record<string, any[]> = {}
    if (Array.isArray(allCompanyDocuments)) {
      allCompanyDocuments.forEach(doc => {
        if (doc.company_id) {
          if (!map[doc.company_id]) map[doc.company_id] = []
          map[doc.company_id].push(doc)
        }
      })
    }
    return map
  }, [allCompanyDocuments])

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

  useEffect(() => {
    if (relationshipData.length === 0) return
    let cancelled = false
    resolveAutomationFieldData(data.automations || [], relationshipData, task).then(result => {
      if (cancelled) return
      setJobFieldsRecord(result.jobFieldsRecord)
      setFieldSourceDataCache(prev => {
        const next = { ...prev }
        Object.entries(result.fieldSourceDataCache).forEach(([table, records]) => { next[table] = { ...(next[table] || {}), ...records } })
        return next
      })
      setFieldMasterComputedCache(prev => ({ ...prev, ...result.fieldMasterComputedCache }))
    })
    return () => { cancelled = true }
  }, [data.automations, relationshipData, task])

  const toggleRequirementExpansion = useCallback((reqId: string) => {
    setExpandedRequirements(prev => {
      const next = new Set(prev)
      if (next.has(reqId)) next.delete(reqId)
      else next.add(reqId)
      return next
    })
  }, [])

  const toggleCompositeExpansion = useCallback((reqId: string) => {
    setExpandedComposites(prev => {
      const next = new Set(prev)
      if (next.has(reqId)) next.delete(reqId)
      else next.add(reqId)
      return next
    })
  }, [])

  const getDocumentStatus = useCallback(async (task: any, docId: string, colType: string, colId: number | string, docs: any[]) => {
    const cacheKey = `${task.id}-${docId}-${colType}-${colId}`

    if (documentStatusCache.has(cacheKey)) {
      return documentStatusCache.get(cacheKey)
    }

    try {
      const docMetadata = kycDocsMap.get(docId)
      if (!docMetadata) {
        const result = { status: 'unknown', label: 'Unknown', color: 'text-gray-500', bgColor: 'bg-gray-100' }
        setDocumentStatusCache(prev => new Map(prev.set(cacheKey, result)))
        return result
      }

      const hasEffectiveToDate = docMetadata.fields?.some((f: any) => f.isEffectiveTo)
      if (!hasEffectiveToDate) {
        const result = { status: 'valid', label: 'Valid', color: 'text-green-600', bgColor: 'bg-green-50' }
        setDocumentStatusCache(prev => new Map(prev.set(cacheKey, result)))
        return result
      }

      const latestDoc = docs.reduce((prev, curr) =>
        new Date(curr.created_at || 0) > new Date(prev.created_at || 0) ? curr : prev
      )
      const personId = colType === 'company' ? (task.company_id || colId) : colId
      const expiryDate = await getLatestDocumentExpiryDate(
        personId,
        [docId],
        undefined,
        latestDoc ? { doc: latestDoc, type: docMetadata } : undefined
      )

      if (expiryDate.includes('Not Found')) {
        const result = { status: 'unknown', label: 'No Expiry', color: 'text-gray-500', bgColor: 'bg-gray-100' }
        setDocumentStatusCache(prev => new Map(prev.set(cacheKey, result)))
        return result
      }

      const expiry = new Date(expiryDate)
      if (isNaN(expiry.getTime())) {
        const result = { status: 'unknown', label: 'No Expiry', color: 'text-gray-500', bgColor: 'bg-gray-100' }
        setDocumentStatusCache(prev => new Map(prev.set(cacheKey, result)))
        return result
      }

      const now = new Date()
      const thirtyDaysFromNow = new Date()
      thirtyDaysFromNow.setDate(now.getDate() + 30)

      let status, label, color, bgColor
      if (expiry < now) {
        status = 'expired'; label = 'Expired'; color = 'text-red-600'; bgColor = 'bg-red-50'
      } else if (expiry < thirtyDaysFromNow) {
        status = 'expiring'; label = 'Expiring Soon'; color = 'text-amber-600'; bgColor = 'bg-amber-50'
      } else {
        status = 'valid'; label = 'Valid'; color = 'text-green-600'; bgColor = 'bg-green-50'
      }

      const day = String(expiry.getDate()).padStart(2, '0')
      const month = String(expiry.getMonth() + 1).padStart(2, '0')
      const year = expiry.getFullYear()
      const formattedDate = `${day}/${month}/${year}`

      const result = { status, label, color, bgColor, expiryDate: formattedDate }
      setDocumentStatusCache(prev => new Map(prev.set(cacheKey, result)))
      return result
    } catch (error) {
      const result = { status: 'error', label: 'Error', color: 'text-red-500', bgColor: 'bg-red-50' }
      setDocumentStatusCache(prev => new Map(prev.set(cacheKey, result)))
      return result
    }
  }, [documentStatusCache, kycDocsMap])

  const renderStatusBadge = (status: any) => {
    if (!status) return null
    const tone: Record<string, string> = {
      valid: "bg-emerald-50 text-emerald-700 border-emerald-200",
      expiring: "bg-amber-50 text-amber-700 border-amber-200",
      expired: "bg-red-50 text-red-700 border-red-200",
      error: "bg-red-50 text-red-700 border-red-200",
    }
    return (
      <span className={cn("inline-flex items-center text-sm font-semibold px-2.5 py-0.5 rounded-full border whitespace-nowrap", tone[status.status] || "bg-slate-50 text-slate-600 border-slate-200")}>
        {status.label}
      </span>
    )
  }

  useEffect(() => {
    const calculateAllStatuses = async () => {
      if (!task?.requirements) return

      for (const req of task.requirements) {
        const docIds = req.document_ids || (req.document_id ? [req.document_id] : [])
        for (const col of columns) {
          for (const docId of docIds) {
            const status = getCellStatus(req, col, documentsByIndividual, allCompanyDocumentsMap)
            if (status.type === 'na' || status.docs.length === 0) continue

            const cacheKey = `${task.id}-${docId}-${col.type}-${col.id}`
            if (!documentStatusCache.has(cacheKey)) {
              await getDocumentStatus(task, docId, col.type, col.id, status.docs)
            }
          }
        }
      }
    }
    calculateAllStatuses()
  }, [task?.requirements, columns, documentsByIndividual, allCompanyDocumentsMap])

  const requirementMap = useMemo(() => {
    if (!task?.requirements) return {}
    const map: Record<string, any[]> = {}
    task.requirements.forEach((req: any) => {
      const cat = req.category || "other"
      if (!map[cat]) map[cat] = []
      map[cat].push(req)
    })
    return map
  }, [task])

  const filteredRequirementMap = useMemo(() => {
    if (!searchQuery.trim()) return requirementMap
    const q = searchQuery.toLowerCase().trim()
    const filtered: Record<string, any[]> = {}
    for (const [cat, reqs] of Object.entries(requirementMap)) {
      const matched = reqs.filter((req: any) => {
        const name = (req.name || req.display_name || "").toLowerCase()
        const desc = (req.description || "").toLowerCase()
        const docMeta = kycDocsMap.get(req.document_id || req.document_ids?.[0])
        const docName = (docMeta?.display_name || docMeta?.name || "").toLowerCase()
        return name.includes(q) || desc.includes(q) || docName.includes(q)
      })
      if (matched.length > 0) filtered[cat] = matched
    }
    return filtered
  }, [requirementMap, searchQuery, kycDocsMap])

  useEffect(() => {
    if (!searchQuery.trim()) return
    const cats = new Set<string>(expandedCategories)
    for (const cat of Object.keys(filteredRequirementMap)) {
      cats.add(cat)
    }
    setExpandedCategories(cats)
  }, [searchQuery, filteredRequirementMap])

  // Scroll to and highlight a specific requirement when deep-linked from an
  // automation field's "Linked Requirement" button.
  useEffect(() => {
    if (!highlightRequirementId) return
    let matchCat: string | null = null
    let matchIdx = -1
    for (const [cat, reqs] of Object.entries(requirementMap)) {
      const idx = (reqs as any[]).findIndex((r: any, i: number) => (r.id || `${cat}-${i}`) === String(highlightRequirementId))
      if (idx !== -1) { matchCat = cat; matchIdx = idx; break }
    }
    if (!matchCat) return
    const reqId = requirementMap[matchCat][matchIdx].id || `${matchCat}-${matchIdx}`
    setExpandedCategories(prev => new Set(prev).add(matchCat as string))
    const timer = setTimeout(() => {
      requirementRowRefs.current[String(reqId)]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      setHighlightedRowId(reqId)
    }, 150)
    const clearTimer = setTimeout(() => setHighlightedRowId(null), 3000)
    return () => { clearTimeout(timer); clearTimeout(clearTimer) }
  }, [highlightRequirementId, requirementMap])

  const handlePreview = useCallback(async (req: any, col: ColDef, locked?: boolean, specificDocId?: string) => {
    const docIds = specificDocId ? [specificDocId] : (req.document_ids || (req.document_id ? [req.document_id] : []))
    if (!docIds.length) return

    let docs: any[] = []
    if (col.type === "company") {
      docs = (allCompanyDocumentsMap[col.id] || []).filter((d: any) => docIds.includes(d.document_id))
    } else {
      docs = (documentsByIndividual[col.id] || []).filter((d: any) => docIds.includes(d.document_id))
    }
    if (docs.length === 0) return

    try {
      const documentPreviews = await Promise.all(docs.map(async (doc) => {
        const { data: signData } = await supabase.storage.from('kyc-documents').createSignedUrl(doc.file_path, 3600);
        const fields = doc.document_id ? (kycDocsMap.get(doc.document_id)?.fields || []) : [];
        return {
          id: doc.id,
          fileUrl: signData?.signedUrl,
          extractedData: doc.extracted_details || {},
          fields,
          name: kycDocsMap.get(doc.document_id)?.display_name || req.display_name || 'Document',
          originalDoc: doc
        };
      }));

      setPreviewDocument({ documents: documentPreviews.filter(Boolean), currentIndex: 0, locked });
      setPreviewDialogOpen(true);
    } catch (err) { console.error(err); toast.error('Preview failed'); }
  }, [documentsByIndividual, allCompanyDocumentsMap, kycDocsMap])

  const handleDeleteDocument = async (doc: any) => {
    if (!confirm("Are you sure you want to delete this document?")) return
    try {
      const targetTable = doc.director_id ? "acc_portal_directors_documents" : "acc_portal_kyc_uploads"
      await supabase.from(targetTable).delete().eq("id", doc.id)
      onRefresh?.()
      setPreviewDialogOpen(false)
      toast.success("Document deleted")
    } catch { toast.error("Delete failed") }
  }

  // ── Toolbar state: status tab, participant visibility, stats ──────────────
  const [statusTab, setStatusTab] = useState<StatusTab>("all")
  const [hiddenColumnIds, setHiddenColumnIds] = useState<Set<string>>(new Set())
  const [showStats, setShowStats] = useState(false)

  const visibleColumns = useMemo(
    () => columns.filter(c => !hiddenColumnIds.has(String(c.id))),
    [columns, hiddenColumnIds]
  )

  // Per-requirement roll-up across ALL participants (not just visible ones), so
  // hiding a column never changes which tab a requirement lands in.
  const requirementBuckets = useMemo(() => {
    const buckets = new Map<string, { na: boolean; missing: boolean; expired: boolean }>()
    if (!task?.requirements) return buckets
    task.requirements.forEach((req: any, i: number) => {
      const key = String(req.id || `${req.category || "other"}-${i}`)
      const cells = columns
        .map(col => ({ col, status: getCellStatus(req, col, documentsByIndividual, allCompanyDocumentsMap) }))
        .filter(({ status }) => status.type !== "na")
      if (cells.length === 0) {
        buckets.set(key, { na: true, missing: false, expired: false })
        return
      }
      const missing = cells.some(({ status }) => status.type === "upload")
      const expired = cells.some(({ col, status }) => {
        if (status.type !== "view") return false
        const latest = getLatestDoc(status.docs)
        const cached = latest ? documentStatusCache.get(`${task.id}-${latest.document_id}-${col.type}-${col.id}`) : null
        return cached?.status === "expired" || cached?.status === "expiring"
      })
      buckets.set(key, { na: false, missing, expired })
    })
    return buckets
  }, [task, columns, documentsByIndividual, allCompanyDocumentsMap, documentStatusCache])

  const bucketKeyFor = (req: any, cat: string, idx: number) => String(req.id || `${cat}-${idx}`)

  const matchesStatusTab = useCallback((req: any, cat: string, idx: number, tab: StatusTab) => {
    if (tab === "all") return true
    const b = requirementBuckets.get(bucketKeyFor(req, cat, idx))
    if (!b) return false
    if (tab === "na") return b.na
    if (tab === "missing") return b.missing
    if (tab === "expired") return b.expired
    return !b.na && !b.missing // uploaded / complete
  }, [requirementBuckets])

  // Counts respect the search box so the tabs always describe what the user is looking at.
  const statusCounts = useMemo(() => {
    const base = searchQuery.trim() ? filteredRequirementMap : requirementMap
    const counts: Record<StatusTab, number> = { all: 0, uploaded: 0, missing: 0, expired: 0, na: 0 }
    Object.entries(base).forEach(([cat, reqs]) => {
      ;(reqs as any[]).forEach(req => {
        const idx = (requirementMap[cat] || []).indexOf(req)
        counts.all++
        ;(["uploaded", "missing", "expired", "na"] as StatusTab[]).forEach(t => {
          if (matchesStatusTab(req, cat, idx, t)) counts[t]++
        })
      })
    })
    return counts
  }, [requirementMap, filteredRequirementMap, searchQuery, matchesStatusTab])

  const visibleRequirementMap = useMemo(() => {
    const base = searchQuery.trim() ? filteredRequirementMap : requirementMap
    if (statusTab === "all") return base
    const out: Record<string, any[]> = {}
    Object.entries(base).forEach(([cat, reqs]) => {
      const kept = (reqs as any[]).filter(req => matchesStatusTab(req, cat, (requirementMap[cat] || []).indexOf(req), statusTab))
      if (kept.length) out[cat] = kept
    })
    return out
  }, [requirementMap, filteredRequirementMap, searchQuery, statusTab, matchesStatusTab])

  const activeFilterChips = useMemo(() => {
    const chips: { label: string; onClear: () => void }[] = []
    if (searchQuery.trim()) chips.push({ label: `Search: ${searchQuery.trim()}`, onClear: () => setSearchQuery("") })
    if (statusTab !== "all") {
      const t = STATUS_TABS.find(s => s.value === statusTab)
      chips.push({ label: `Status: ${t?.label}`, onClear: () => setStatusTab("all") })
    }
    if (hiddenColumnIds.size > 0) chips.push({ label: `${hiddenColumnIds.size} participant${hiddenColumnIds.size === 1 ? "" : "s"} hidden`, onClear: () => setHiddenColumnIds(new Set()) })
    return chips
  }, [searchQuery, statusTab, hiddenColumnIds])

  const clearAllFilters = () => {
    setSearchQuery("")
    setStatusTab("all")
    setHiddenColumnIds(new Set())
  }

  const allCategoriesExpanded = CATEGORY_ORDER.every(c => !(visibleRequirementMap[c]?.length) || expandedCategories.has(c))
  const toggleAllCategories = () =>
    setExpandedCategories(allCategoriesExpanded ? new Set() : new Set(CATEGORY_ORDER))

  const handleExportExcel = useCallback(async () => {
    try {
      const XLSX = await import("xlsx")
      const rows: any[] = []
      CATEGORY_ORDER.forEach(cat => {
        ;(visibleRequirementMap[cat] || []).forEach((req: any) => {
          const row: Record<string, any> = {
            Category: CATEGORY_LABELS[cat],
            Requirement: req.name || req.display_name || "Untitled Requirement",
            "Document Type": getDocTypeDisplay(req, kycDocsMap)?.allNames?.join(" + ") || "",
          }
          visibleColumns.forEach(col => {
            const status = getCellStatus(req, col, documentsByIndividual, allCompanyDocumentsMap)
            const latest = status.docs.length ? getLatestDoc(status.docs) : null
            const cached = latest ? documentStatusCache.get(`${task.id}-${latest.document_id}-${col.type}-${col.id}`) : null
            const key = `${col.label} (${col.subLabel})`
            row[key] = status.type === "na" ? "N/A" : status.type === "view" ? (cached ? `${cached.label}${cached.expiryDate ? ` – ${cached.expiryDate}` : ""}` : "Uploaded") : "Missing"
          })
          rows.push(row)
        })
      })
      if (rows.length === 0) { toast.info("Nothing to export"); return }
      const ws = XLSX.utils.json_to_sheet(rows)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, "Requirements")
      XLSX.writeFile(wb, `requirements-task-${task.id}.xlsx`)
    } catch (err) {
      console.error(err)
      toast.error("Export failed")
    }
  }, [visibleRequirementMap, visibleColumns, kycDocsMap, documentsByIndividual, allCompanyDocumentsMap, documentStatusCache, task])

  if (!task) return null

  const totalCols = visibleColumns.length + 3 // # + DocType + Name + entity columns

  return (
    <div className="h-full flex flex-col overflow-hidden bg-slate-50/50 px-3 py-3">
      {/* Toolbar — Email Center tokens: pill tabs with count badges, h-10 outline controls, one primary action */}
      <div className="flex items-center gap-x-3 gap-y-2 flex-wrap pb-3 shrink-0 antialiased">
        <Tabs value={statusTab} onValueChange={(v) => setStatusTab(v as StatusTab)}>
          <TabsList className={TAB_LIST_CLASS}>
            {STATUS_TABS.map(tab => {
              const count = statusCounts[tab.value]
              const urgent = (tab.value === "missing" || tab.value === "expired") && count > 0
              return (
                <TabsTrigger key={tab.value} value={tab.value} title={tab.description} className={TAB_TRIGGER_CLASS}>
                  {tab.label}
                  <span className={urgent ? URGENT_BADGE_CLASS : COUNT_BADGE_CLASS}>{count}</span>
                </TabsTrigger>
              )
            })}
          </TabsList>
        </Tabs>

        {lockState.processingLocked && (
          <span className="inline-flex items-center gap-1.5 text-base font-medium text-amber-800 bg-amber-50 border border-amber-200 rounded-full px-3 py-1">
            <Lock className="h-4 w-4 text-amber-600 shrink-0" /> Processing locked
          </span>
        )}
        {lockState.issuanceLocked && (
          <span className="inline-flex items-center gap-1.5 text-base font-medium text-blue-800 bg-blue-50 border border-blue-200 rounded-full px-3 py-1">
            <Lock className="h-4 w-4 text-blue-600 shrink-0" /> Issuance locked
          </span>
        )}
        {clientDraft && clientDraft.status !== "applied" && (
          <button
            onClick={() => setReviewOpen(true)}
            className="inline-flex items-center gap-1.5 text-base font-medium text-amber-800 bg-amber-50 border border-amber-200 rounded-full px-3 py-1 hover:bg-amber-100 transition-colors"
            title="The client submitted requirement changes that haven't been applied yet"
          >
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
            Client draft to review
            <span className="underline font-semibold">Review →</span>
          </button>
        )}

        <div className="ml-auto flex items-center gap-2 flex-wrap">
          <div className="relative w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search requirement, document, description…"
              className="w-full h-10 pl-10 pr-9 bg-white border border-slate-200 rounded-md text-base placeholder:text-slate-400 shadow-none focus:outline-none focus-visible:ring-1 focus-visible:ring-custom-blue"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery("")} aria-label="Clear search" className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 transition-colors">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {activeFilterChips.length > 0 && (
            <button onClick={clearAllFilters} className="inline-flex items-center gap-1 text-base text-custom-blue hover:underline font-medium">
              <X className="h-4 w-4" /> Clear filters
            </button>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className={cn(PILL_BUTTON_CLASS, hiddenColumnIds.size > 0 && PILL_BUTTON_ACTIVE_CLASS)}>
                <Layers className="h-5 w-5" /> Participants{hiddenColumnIds.size > 0 ? ` (${hiddenColumnIds.size} hidden)` : ""}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72 p-0 rounded-lg">
              <div className="max-h-80 overflow-y-auto py-1">
                {columns.map(col => {
                  const checked = !hiddenColumnIds.has(String(col.id))
                  return (
                    <label key={col.id} className="flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-slate-50 cursor-pointer">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => setHiddenColumnIds(prev => { const n = new Set(prev); if (checked) n.add(String(col.id)); else n.delete(String(col.id)); return n })}
                      />
                      <span className="truncate font-normal text-slate-700 flex-1">{col.label}</span>
                      <span className="text-xs uppercase text-slate-400">{col.subLabel}</span>
                    </label>
                  )
                })}
              </div>
              {hiddenColumnIds.size > 0 && (
                <div className="border-t border-slate-100 p-1.5">
                  <button type="button" onClick={() => setHiddenColumnIds(new Set())} className="w-full text-center text-sm text-custom-blue hover:underline py-1">Show all</button>
                </div>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          <Button variant="outline" size="sm" onClick={toggleAllCategories} className={PILL_BUTTON_CLASS}>
            {allCategoriesExpanded ? <ChevronsDownUp className="h-5 w-5" /> : <ChevronsUpDown className="h-5 w-5" />}
            {allCategoriesExpanded ? "Collapse" : "Expand"}
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowStats(v => !v)}
            aria-pressed={showStats}
            className={cn(PILL_BUTTON_CLASS, showStats && PILL_BUTTON_ACTIVE_CLASS)}
            title="Show Total / Complete / Missing / Expired counts"
          >
            <BarChartHorizontal className="h-5 w-5" /> Stats
          </Button>

          <Button variant="outline" size="sm" onClick={handleExportExcel} className={PILL_BUTTON_CLASS} title="Download what's shown (current tab, search and participants) as an Excel file">
            <Download className="h-5 w-5" /> Export
          </Button>

          {onRefresh && (
            <Button variant="outline" size="sm" onClick={() => onRefresh()} className={PILL_BUTTON_CLASS} title="Reload from the database">
              <RefreshCw className="h-5 w-5" /> Refresh
            </Button>
          )}

          <Button size="sm" onClick={() => setIsSendRequirementsOpen(true)} className={PRIMARY_PILL_BUTTON_CLASS}>
            <Send className="h-5 w-5" /> Send Requirements
          </Button>
        </div>
      </div>

      {/* Stats cards */}
      {showStats && (
        <div className="grid grid-cols-4 gap-3 pb-3 shrink-0">
          {[
            { label: "Requirements", value: statusCounts.all, cls: "text-slate-900" },
            { label: "Complete", value: statusCounts.uploaded, cls: "text-emerald-600" },
            { label: "Missing", value: statusCounts.missing, cls: statusCounts.missing > 0 ? "text-red-600" : "text-slate-400" },
            { label: "Expired / Expiring", value: statusCounts.expired, cls: statusCounts.expired > 0 ? "text-amber-600" : "text-slate-400" },
          ].map(card => (
            <div key={card.label} className="px-4 py-3 rounded-lg border border-slate-200/80 bg-white">
              <div className="text-sm font-bold uppercase tracking-wide text-slate-500">{card.label}</div>
              <div className={cn("mt-1 text-2xl font-semibold tabular-nums", card.cls)}>{card.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Main Table Container */}
      <div className="flex-1 overflow-auto relative custom-scrollbar border border-slate-200/80 rounded-lg bg-white">
        <Table className="border-separate border-spacing-0 min-w-full">
          <TableHeader className="sticky top-0 z-30 text-white">
            <TableRow className="bg-custom-blue hover:bg-custom-blue">
              <TableHead className="w-12 border-b border-r border-white/20 sticky left-0 top-0 bg-custom-blue z-40 p-0 text-white">
                <div className="flex items-center justify-center text-base font-semibold">#</div>
              </TableHead>
              <TableHead className="w-[300px] border-b border-r border-white/20 sticky left-12 top-0 bg-custom-blue z-40 p-0 text-white">
                <div className="flex items-center px-4 py-2.5 text-base font-semibold">
                  Requirement
                </div>
              </TableHead>
              <TableHead className="max-w-[280px] border-b border-r border-white/20 sticky left-[348px] top-0 bg-custom-blue z-40 p-0 text-white">
                <div className="flex items-center px-4 py-2.5 text-base font-semibold">
                  Document Type
                </div>
              </TableHead>
              {visibleColumns.map(col => {
                const { bgColor, Icon } = getEntityTypeConfig(col.type)
                return (
                  <TableHead key={col.id} className={cn("min-w-[340px] border-b border-r border-white/20 top-0 p-0 text-white align-top", bgColor)}>
                    <div className="flex flex-col h-full w-full">
                      <div className="flex flex-col items-center justify-center gap-1.5 border-b border-white/20 flex-1 p-3">
                        <span className={cn("flex items-center gap-2 text-base font-semibold")}>
                          <Icon className="h-4 w-4 opacity-90" />
                          <span className="truncate max-w-[200px]">{col.label}</span>
                        </span>
                        <span className="text-sm font-medium opacity-80">{col.subLabel}</span>
                      </div>
                      <div className="grid grid-cols-[90px_120px_1fr] text-sm font-semibold bg-black/10 shrink-0">
                        <div className="py-2 px-2 text-center border-r border-white/10 opacity-80">Date</div>
                        <div className="py-2 px-2 text-center border-r border-white/10 opacity-80">Status</div>
                        <div className="py-2 px-2 text-center opacity-80">Action</div>
                      </div>
                    </div>
                  </TableHead>
                )
              })}
            </TableRow>
          </TableHeader>
          <TableBody>
            {Object.keys(visibleRequirementMap).length === 0 && (
              <TableRow>
                <TableCell colSpan={totalCols} className="h-48 text-center text-slate-500">
                  <Search className="h-10 w-10 mx-auto mb-2 opacity-40" />
                  <div className="text-base">No requirements match the current filters</div>
                  {activeFilterChips.length > 0 && <button onClick={clearAllFilters} className="mt-2 text-base text-custom-blue hover:underline">Clear all filters</button>}
                </TableCell>
              </TableRow>
            )}
            {CATEGORY_ORDER.map(cat => {
              const reqs = visibleRequirementMap[cat] || []
              if (reqs.length === 0) return null
              const isLocked = isSectionLocked(task, cat)
              const isExpanded = expandedCategories.has(cat)

              return (
                <React.Fragment key={cat}>
                  {/* Category Separator Row */}
                  <TableRow
                    className="bg-slate-100 hover:bg-slate-200/70 cursor-pointer transition-colors"
                    onClick={() => setExpandedCategories(prev => {
                      const next = new Set(prev)
                      if (next.has(cat)) next.delete(cat)
                      else next.add(cat)
                      return next
                    })}
                  >
                    <TableCell
                      colSpan={totalCols}
                      className="py-2 px-4 border-b border-slate-200/80 sticky left-0 z-20"
                    >
                      <div className="flex items-center gap-3">
                        {isExpanded ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
                        <span className="text-sm font-bold uppercase tracking-wide text-slate-500">{CATEGORY_LABELS[cat]}</span>
                        <span className={COUNT_BADGE_CLASS}>{reqs.length}</span>
                        {isLocked && <span className="inline-flex items-center gap-1 text-sm font-semibold px-2.5 py-0.5 rounded-full border bg-amber-50 text-amber-700 border-amber-200"><Lock className="h-3.5 w-3.5" />Locked</span>}
                      </div>
                    </TableCell>
                  </TableRow>

                  {/* Requirements Rows */}
                  {isExpanded && reqs.map((req, idx) => {
                    const docMeta = kycDocsMap.get(req.document_id || req.document_ids?.[0])
                    const docName = docMeta?.display_name || req.display_name || req.name || "Untitled"
                    const docTypeInfo = getDocTypeDisplay(req, kycDocsMap)
                    const isComposite = docTypeInfo?.isComposite && (req.document_ids?.length > 1)
                    const reqId = req.id || `${cat}-${idx}`
                    const isReqExpanded = expandedRequirements.has(reqId)
                    const isCompExpanded = expandedComposites.has(reqId)
                    const fieldsToRender = docMeta?.fields || []
                    
                    // ONLY render the template wand if explicitly marked hasTemplate === true
                    const hasTemplateExplicitly = req.hasTemplate === true || String(req.hasTemplate) === 'true'
                    const stripeBg = idx % 2 === 1 ? "bg-slate-50" : "bg-white"

                    return (
                      <React.Fragment key={reqId}>
                        {/* Main Requirement Row */}
                        <TableRow
                          ref={(el) => { requirementRowRefs.current[String(reqId)] = el }}
                          className={cn(
                            "group transition-colors",
                            stripeBg, "hover:bg-slate-100",
                            highlightedRowId === reqId && "ring-2 ring-inset ring-custom-blue bg-blue-50 animate-pulse"
                          )}
                        >
                          <TableCell className={cn("w-12 py-0 px-0 text-center text-sm tabular-nums text-slate-400 border-b border-r border-slate-200/70 sticky left-0 z-10 align-middle", stripeBg, "group-hover:bg-slate-100")}>
                            <div className="flex items-center justify-center h-full font-medium">
                              {idx + 1}
                            </div>
                          </TableCell>

                          <TableCell className={cn("w-[400px] py-0 px-4 border-b border-r border-slate-200/70 sticky left-12 z-10 align-middle", stripeBg, "group-hover:bg-slate-100")}>
                            <div className="flex items-center gap-3 h-full py-3 justify-between">
                              <div className="flex flex-col min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-base font-medium text-slate-900 line-clamp-2 leading-snug">
                                    <HighlightText text={req.name || req.display_name || "Untitled Requirement"} query={searchQuery} />
                                  </span>
                                  {req.web_automation?.automationId && (
                                    <button
                                      type="button"
                                      onClick={(e) => { e.stopPropagation(); window.open(`/dashboard/tasks/${task.id}?tab=automation&automationId=${req.web_automation.automationId}`, '_blank', 'noopener,noreferrer') }}
                                      className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-purple-600 text-white ring-1 ring-purple-100 hover:bg-purple-700 hover:ring-purple-200 transition-colors shrink-0"
                                      title={`Generated by automation: ${req.web_automation.automationName || 'View automation'}`}
                                    >
                                      <Zap className="h-3.5 w-3.5" fill="currentColor" />
                                    </button>
                                  )}
                                  {hasTemplateExplicitly && isTemplateEligible(req, docMeta) && (
                                    <button
                                      type="button"
                                      onClick={(e) => { e.stopPropagation(); window.open(`/dashboard/tasks/${task.id}?tab=templates&documentId=${req.document_id || req.document_ids?.[0]}`, '_blank', 'noopener,noreferrer') }}
                                      className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-blue-600 text-white ring-1 ring-blue-100 hover:bg-blue-700 hover:ring-blue-200 transition-colors shrink-0"
                                      title="Generate document from template"
                                    >
                                      <Wand2 className="h-3.5 w-3.5" />
                                    </button>
                                  )}
                                </div>
                                {hasTemplateExplicitly && isTemplateEligible(req, docMeta) && (() => {
                                  const progress = templateProgress[String(req.id)]
                                  if (!progress) return (
                                    <span className="text-sm text-slate-400 mt-1">Checking template...</span>
                                  )
                                  const pct = progress.total > 0 ? Math.round((progress.filled / progress.total) * 100) : 0
                                  return (
                                    <div className="flex items-center gap-1.5 mt-1 w-full max-w-[140px]">
                                      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                        <div
                                          className={cn("h-full rounded-full transition-all", pct === 100 ? "bg-emerald-500" : "bg-blue-500")}
                                          style={{ width: `${pct}%` }}
                                        />
                                      </div>
                                      <span className={cn("text-sm font-semibold tabular-nums shrink-0", pct === 100 ? "text-emerald-600" : "text-slate-500")}>
                                        {progress.total > 0 ? `${progress.filled}/${progress.total}` : "N/A"}
                                      </span>
                                    </div>
                                  )
                                })()}
                                {isComposite && (
                                  <span className="text-sm font-semibold text-custom-blue mt-1">
                                    {docTypeInfo.count} Types
                                  </span>
                                )}
                              </div>
                              {isComposite ? (
                                <button
                                  className="p-1.5 bg-slate-50 hover:bg-slate-200 rounded-full transition-colors shrink-0 border border-slate-200/70"
                                  onClick={() => toggleCompositeExpansion(reqId)}
                                  title="Expand document types"
                                >
                                  {isCompExpanded ? <ChevronDown className="h-4 w-4 text-slate-600" /> : <ChevronRight className="h-4 w-4 text-slate-600" />}
                                </button>
                              ) : fieldsToRender.length > 0 ? (
                                <button
                                  className="p-1.5 bg-slate-50 hover:bg-slate-200 rounded-full transition-colors shrink-0 border border-slate-200/70"
                                  onClick={() => toggleRequirementExpansion(reqId)}
                                  title="Expand fields"
                                >
                                  {isReqExpanded ? <Minus className="h-4 w-4 text-slate-600" /> : <Plus className="h-4 w-4 text-slate-600" />}
                                </button>
                              ) : (
                                <div className="w-[30px] shrink-0" />
                              )}

                            </div>
                          </TableCell>

                          <TableCell className={cn("max-w-[280px] py-0 px-5 border-b border-r border-slate-200/70 sticky left-[348px] z-10 align-middle", stripeBg, "group-hover:bg-slate-100")}>
                            <div className="flex flex-col gap-1.5 h-full justify-center py-3">
                              <span className="text-base text-slate-700 line-clamp-2 leading-snug">
                                <HighlightText text={docTypeInfo?.primary?.display_name || docTypeInfo?.primary?.name || docName} query={searchQuery} />
                              </span>
                              {req.description && <span className="text-sm text-slate-500 line-clamp-2 leading-snug"><HighlightText text={req.description} query={searchQuery} /></span>}
                            </div>
                          </TableCell>

                          {visibleColumns.map(col => {
                            const status = getCellStatus(req, col, documentsByIndividual, allCompanyDocumentsMap)
                            const docIds = req.document_ids || (req.document_id ? [req.document_id] : [])
                            const latestDoc = status.docs.length > 0 ? getLatestDoc(status.docs) : null
                            const latestDocId = latestDoc?.document_id || docIds[0]
                            const statusKey = latestDocId ? `${task.id}-${latestDocId}-${col.type}-${col.id}` : null
                            const docStatus = statusKey ? documentStatusCache.get(statusKey) : null

                            return (
                              <TableCell key={col.id} className={cn("p-0 border-b border-r border-slate-200/70 align-middle transition-colors", stripeBg, "group-hover:bg-slate-100")}>
                                {status.type === "na" ? (
                                  <div className="flex h-full min-h-[48px] items-center justify-center p-3" title="Not applicable">
                                    <span className="text-slate-300">—</span>
                                  </div>
                                ) : (
                                  <div className="grid grid-cols-[90px_120px_1fr] h-full">
                                    <div className="p-3 border-r border-slate-200/70 flex items-center justify-center text-base text-slate-700 tabular-nums text-center break-words">
                                      {status.type === 'view' ? (docStatus?.expiryDate || <span className="text-slate-400">No expiry</span>) : <span className="text-slate-300">—</span>}
                                    </div>
                                    <div className="p-3 border-r border-slate-200/70 flex items-center justify-center text-center">
                                      {status.type === 'view' ? (
                                        docStatus ? renderStatusBadge(docStatus) : <Loader2 className="h-4 w-4 animate-spin text-slate-300" />
                                      ) : (
                                        isLocked ? (
                                          <span className="inline-flex items-center text-sm font-semibold px-2.5 py-0.5 rounded-full border bg-red-50 text-red-700 border-red-200">Missing</span>
                                        ) : (
                                          <span className="inline-flex items-center text-sm font-semibold px-2.5 py-0.5 rounded-full border bg-amber-50 text-amber-700 border-amber-200">Pending</span>
                                        )
                                      )}
                                    </div>
                                    <div className="p-3 flex items-center justify-center text-center">
                                      {status.type === 'view' ? (
                                        <button className="inline-flex items-center gap-1.5 text-base font-medium text-custom-blue hover:underline" onClick={() => handlePreview(req, col, isLocked, isComposite ? latestDocId : undefined)}>
                                          <Eye className="h-4 w-4" /> View
                                        </button>
                                      ) : (
                                        isLocked ? (
                                          <span className="text-sm font-medium text-slate-400">Locked</span>
                                        ) : (
                                          <Button
                                            variant="outline"
                                            size="sm"
                                            className="h-8 px-3 rounded-md text-base font-medium gap-1.5 border-slate-200/70 bg-white text-custom-blue hover:bg-blue-50 shadow-none transition-all"
                                            onClick={() => {
                                              setSelectedDocForUpload({ ...req, person: { id: col.id, full_name: col.label } });
                                              setUploadModalOpen(true);
                                            }}
                                          >
                                            <UploadCloud className="h-4 w-4 mr-1.5" /> Upload
                                          </Button>
                                        )
                                      )}
                                    </div>
                                  </div>
                                )}
                              </TableCell>
                            )
                          })}
                        </TableRow>

                        {/* Composite: Individual Document Type Sub-Rows */}
                        {isComposite && isCompExpanded && req.document_ids?.map((docId: string, docIdx: number) => {
                          const subDocMeta = kycDocsMap.get(docId)
                          if (!subDocMeta) return null

                          return (
                            <TableRow key={`${reqId}-sub-${docIdx}`} className="bg-slate-100 hover:bg-slate-200/70 transition-colors">
                              <TableCell className="w-12 py-3 text-center text-sm tabular-nums text-slate-400 border-b border-r sticky left-0 bg-slate-100 z-10 align-middle">
                                {idx + 1}.{docIdx + 1}
                              </TableCell>
                              <TableCell className="w-[300px] py-3 border-b border-r sticky left-12 bg-slate-100 z-10 pl-14 pr-4 align-middle">
                                <span className="flex items-center gap-2">
                                  <FileText className="h-4 w-4 text-blue-400 shrink-0" />
                                  <span className="text-base font-medium text-slate-800 leading-tight">{subDocMeta.display_name || subDocMeta.name}</span>
                                </span>
                              </TableCell>
                              <TableCell className="min-w-[280px] py-3 px-5 border-b border-r sticky left-[348px] bg-slate-100 z-10 align-middle" />
                              {visibleColumns.map(col => {
                                const subDocs = col.type === "company"
                                  ? (allCompanyDocumentsMap[col.id] || []).filter((d: any) => d.document_id === docId)
                                  : (documentsByIndividual[col.id] || []).filter((d: any) => d.document_id === docId)
                                const hasDocs = subDocs.length > 0
                                const subLatestDoc = hasDocs ? getLatestDoc(subDocs) : null
                                const subStatusKey = `${task.id}-${docId}-${col.type}-${col.id}`
                                const subDocStatus = documentStatusCache.get(subStatusKey)

                                return (
                                  <TableCell key={`${docId}-${col.id}`} className="p-0 border-b border-r align-middle bg-slate-100">
                                    {!checkApplicability(col.type, req) ? (
                                      <div className="flex h-full items-center justify-center p-2">
                                        <span className="text-slate-300">—</span>
                                      </div>
                                    ) : hasDocs ? (
                                      <div className="grid grid-cols-[90px_120px_1fr] h-full">
                                        <div className="p-2 border-r border-slate-200/70 flex items-center justify-center text-base text-slate-700 tabular-nums text-center break-words">
                                          {subDocStatus?.expiryDate || 'NO EXPIRY'}
                                        </div>
                                        <div className="p-2 border-r border-slate-200/70 flex items-center justify-center">
                                          {subDocStatus ? renderStatusBadge(subDocStatus) : <span className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />}
                                        </div>
                                        <div className="p-2 flex items-center justify-center">
                                          <Button variant="ghost" size="sm" className="h-8 px-3 text-base font-medium text-custom-blue hover:bg-blue-50 rounded-md" onClick={() => handlePreview(req, col, isLocked, docId)}>
                                            <Eye className="h-4 w-4 mr-1.5" /> View
                                          </Button>
                                        </div>
                                      </div>
                                    ) : (
                                      <div className="flex h-full items-center justify-center p-2">
                                        <span className="text-slate-300">—</span>
                                      </div>
                                    )}
                                  </TableCell>
                                )
                              })}
                            </TableRow>
                          )
                        })}

                        {/* Non-Composite: Expanded Field Rows */}
                        {!isComposite && isReqExpanded && fieldsToRender.map((field: any, fIdx: number) => (
                          <TableRow key={`${reqId}-field-${field.id || fIdx}`} className="bg-slate-100 hover:bg-slate-200/70 transition-colors">
                            <TableCell className="w-12 py-2.5 text-center text-sm tabular-nums text-slate-400 border-b border-r sticky left-0 bg-slate-100 z-10 align-middle">
                              {idx + 1}.{fIdx + 1}
                            </TableCell>
                            <TableCell className="w-[300px] py-2.5 border-b border-r sticky left-12 bg-slate-100 z-10 pl-14 pr-4 align-middle">
                              <span className="text-base text-slate-600 italic">{field.name}</span>
                            </TableCell>
                            <TableCell className="min-w-[280px] py-2.5 border-b border-r sticky left-[348px] bg-slate-100 z-10 align-middle" />
                            {visibleColumns.map(col => {
                              const isApplicable = checkApplicability(col.type, req)
                              const docData = isApplicable ? getDocDataForReq(req, col, documentsByIndividual, allCompanyDocumentsMap) : null
                              return (
                                <TableCell key={`${field.id || fIdx}-${col.id}`} className="py-2.5 px-3 text-center border-b border-r align-middle bg-slate-100">
                                  {isApplicable ? (() => {
                                    const val = docData?.extracted_details?.[field.name]
                                    if (val === null || val === undefined) return <span className="text-slate-300">—</span>
                                    if (typeof val === 'object') return <span className="text-base text-slate-700 bg-white px-2.5 py-1 rounded border border-slate-200/70">{JSON.stringify(val)}</span>
                                    return <span className="text-base text-slate-700 bg-white px-3 py-1 rounded-md border border-slate-200/70 inline-block max-w-full truncate">{String(val)}</span>
                                  })() : <span className="text-slate-300">—</span>}
                                </TableCell>
                              )
                            })}
                          </TableRow>
                        ))}
                      </React.Fragment>
                    )
                  })}
                </React.Fragment>
              )
            })}
          </TableBody>
        </Table>
      </div>

      {/* Modals & Dialogs */}
      {selectedDocForUpload && (() => {
        const docId = selectedDocForUpload.document_id || selectedDocForUpload.document_ids?.[0]
        const docMeta = kycDocsMap.get(docId)
        const isCompany = selectedDocForUpload.columnType === 'company' || selectedDocForUpload.section_type === 'company'
        const person = selectedDocForUpload.person || {}
        return (
          <UploadModal
            isOpen={uploadModalOpen}
            onClose={() => setUploadModalOpen(false)}
            onSuccess={() => { onRefresh?.(); setUploadModalOpen(false); }}
            documentName={docMeta?.display_name || docMeta?.name || selectedDocForUpload.display_name || selectedDocForUpload.name || "Document"}
            documentFields={docMeta?.fields || []}
            entityName={person.full_name}
            entityId={String(person.id)}
            selectedDoc={docMeta ? { ...docMeta, id: docId } : undefined}
            selectedMember={{ id: person.id, full_name: person.full_name, type: isCompany ? 'company' : 'individual', name: person.full_name }}
            selectedDocumentId={docId}
            targetTable={isCompany ? 'acc_portal_kyc_uploads' : 'acc_portal_directors_documents'}
            idFieldName={isCompany ? 'company_id' : 'director_id'}
            documentIdFieldName="document_id"
            isCompanyUpload={isCompany}
          />
        )
      })()}

      {previewDocument && (
        <Dialog open={previewDialogOpen} onOpenChange={setPreviewDialogOpen}>
          <DialogContent className="max-w-[90vw] w-full h-[90vh] max-h-[90vh] flex flex-col p-0 overflow-hidden">
            <DialogHeader className="sr-only">
              <DialogTitle>
                {previewDocument.documents?.[0]?.name || "Document preview"}
              </DialogTitle>
            </DialogHeader>
            {/* Definite height all the way down (dialog h-[90vh] -> flex-1 min-h-0 -> h-full per document),
                so ExtractionPreview's h-full panels fill the dialog instead of falling back to their floor.
                With several documents each one gets a full-height page and the area scrolls. */}
            <div className="flex-1 min-h-0 overflow-y-auto p-6 bg-slate-50 flex flex-col gap-6">
              {previewDocument.documents.map((doc: any) => (
                <div key={doc.id} className="h-full min-h-0 shrink-0">
                  <ExtractionPreview
                    documentName={doc.name}
                    extractedData={doc.extractedData}
                    fields={doc.fields}
                    fileUrl={doc.fileUrl}
                    expanded={true}
                    showSaveButton={!previewDocument.locked}
                    onDelete={() => handleDeleteDocument(doc.originalDoc)}
                    onDialogClose={() => setPreviewDialogOpen(false)}
                  />
                </div>
              ))}
            </div>
          </DialogContent>
        </Dialog>
      )}

      <SendRequirementsDialog
        isOpen={isSendRequirementsOpen}
        onClose={() => setIsSendRequirementsOpen(false)}
        selectedApplicant={task.applicant_name}
        tasks={[task]}
        taskClassRequirements={{ [task.id]: { requirements: task.requirements, job_level: task.job_level, job_specific_questions: task.job_specific_questions } }}
        automationWebdataMap={automationWebdataMap}
        allCompanyDocuments={allCompanyDocumentsMap}
        allIndividualDocuments={documentsByIndividual}
        fieldSourceDataCache={fieldSourceDataCache}
        fieldMasterComputedCache={fieldMasterComputedCache}
        jobFieldsRecord={jobFieldsRecord}
        relationshipData={relationshipData}
        kycDocsMap={kycDocsMap}
      />

      <ReviewSubmissionDialog
        isOpen={reviewOpen}
        onClose={() => setReviewOpen(false)}
        task={task}
        taskClassRequirements={{ [task.id]: { requirements: task.requirements, job_level: task.job_level, job_specific_questions: task.job_specific_questions } }}
        automationWebdataMap={automationWebdataMap}
        allCompanyDocuments={allCompanyDocumentsMap}
        allIndividualDocuments={documentsByIndividual}
        fieldSourceDataCache={fieldSourceDataCache}
        fieldMasterComputedCache={fieldMasterComputedCache}
        jobFieldsRecord={jobFieldsRecord}
        onRefresh={onRefresh}
      />
    </div>
  )
}