// @ts-nocheck
"use client"

import React, { useState, useMemo, useCallback, useEffect } from "react"
import { useRouter } from "next/navigation"
import {
  CheckCircle2, AlertCircle, UploadCloud, Eye, FileText, Lock, Loader2,
  ChevronDown, ChevronRight, Trash2, RefreshCw, FileUp, XCircle, User,
  Briefcase, UserCheck, Users2, HeartPulse, Send, Search, AlertTriangle, Check, X, ArrowUpDown, ArrowUp, ArrowDown, HelpCircle,
  Calendar, Plus, Minus, FileType, Zap, Wand2
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
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

function getCellStatus(req: any, col: ColDef, docsByInd: Record<string, any[]>, allCompanyDocs: Record<string, any[]>) {
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

    let Icon
    switch (status.status) {
      case 'valid': Icon = CheckCircle2; break
      case 'expiring': Icon = AlertCircle; break
      case 'expired': Icon = XCircle; break
      case 'error': Icon = AlertTriangle; break
      default: Icon = CheckCircle2; break
    }

    return (
      <div className="inline-flex items-center gap-1.5">
        <Icon className={`h-3.5 w-3.5 shrink-0 ${status.color}`} />
        <span className={`text-xs font-medium ${status.color}`}>
          {status.label}
        </span>
      </div>
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
        let fields = [];
        if (doc.document_id) {
          const { data: kycData } = await supabase.from('acc_portal_kyc').select('fields').eq('id', doc.document_id).single();
          if (kycData) fields = kycData.fields || [];
        }
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

  if (!task) return null

  const totalCols = columns.length + 3 // # + DocType + Name + entity columns

  return (
    <div className="h-full flex flex-col overflow-hidden bg-white px-6 py-4">
      {/* Header Bar */}
      <div className="flex items-center justify-between border-b pb-4 mb-3 bg-white shrink-0 z-40">
        <div className="flex items-center gap-4">
          <h3 className="text-xl font-medium text-slate-800 tracking-tight">Requirements Matrix</h3>
          <div className="flex gap-2">
            {lockState.processingLocked && <Badge className="bg-amber-50 text-amber-700 border-amber-200 text-xs font-medium rounded-full px-3 py-0.5"><Lock className="h-3.5 w-3.5 mr-1.5" />Processing Locked</Badge>}
            {lockState.issuanceLocked && <Badge className="bg-blue-50 text-blue-700 border-blue-200 text-xs font-medium rounded-full px-3 py-0.5"><Lock className="h-3.5 w-3.5 mr-1.5" />Issuance Locked</Badge>}
          </div>
          <div className="relative ml-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search requirements..."
              className="h-9 w-64 pl-9 pr-8 text-sm rounded-full border border-slate-200 bg-slate-50 text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-400 transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {clientDraft && clientDraft.status !== "applied" && (
            <Button variant="outline" className="h-10 px-5 text-sm font-semibold rounded-full border-amber-300 text-amber-700 bg-amber-50 hover:bg-amber-100 shadow-sm" onClick={() => setReviewOpen(true)}>
              <AlertTriangle className="h-4 w-4 mr-2" /> Review Draft
            </Button>
          )}
          <Button className="h-10 px-6 text-sm font-medium rounded-full bg-custom-blue hover:bg-blue-700 shadow-sm" onClick={() => setIsSendRequirementsOpen(true)}>
            <Send className="h-4 w-4 mr-2" /> Send Requirements
          </Button>
        </div>
      </div>

      {/* Main Table Container */}
      <div className="flex-1 overflow-auto relative custom-scrollbar border rounded-lg bg-white shadow-sm">
        <Table className="border-separate border-spacing-0 min-w-full">
          <TableHeader className="sticky top-0 z-30 text-white">
            <TableRow className="bg-custom-blue hover:bg-custom-blue">
              <TableHead className="w-12 border-b border-r border-white/15 sticky left-0 top-0 bg-custom-blue z-40 p-0 text-white">
                <div className="flex items-center justify-center text-xs font-medium uppercase tracking-wider">#</div>
              </TableHead>
              <TableHead className="w-[300px] border-b border-r border-white/15 sticky left-12 top-0 bg-custom-blue z-40 p-0 text-white">
                <div className="flex items-center px-6 text-[11px] font-medium uppercase tracking-wider">
                  Requirement
                </div>
              </TableHead>
              <TableHead className="max-w-[280px] border-b border-r border-white/15 sticky left-[348px] top-0 bg-custom-blue z-40 p-0 text-white">
                <div className="flex items-center px-6 text-[11px] font-medium uppercase tracking-wider">
                  Document Type
                </div>
              </TableHead>
              {columns.map(col => {
                const { bgColor, Icon } = getEntityTypeConfig(col.type)
                return (
                  <TableHead key={col.id} className={cn("min-w-[340px] border-b border-r border-white/15 top-0 p-0 text-white align-top", bgColor)}>
                    <div className="flex flex-col h-full w-full">
                      <div className="flex flex-col items-center justify-center gap-1.5 border-b border-white/15 flex-1 p-3">
                        <span className={cn("flex items-center gap-2 text-[11px] font-semibold tracking-wide")}>
                          <Icon className="h-4 w-4 opacity-90" />
                          <span className="truncate max-w-[200px]">{col.label}</span>
                        </span>
                        <span className="text-[10px] font-medium uppercase tracking-wide opacity-80">{col.subLabel}</span>
                      </div>
                      <div className="grid grid-cols-[90px_120px_1fr] text-[10px] uppercase font-medium tracking-wider bg-black/10 shrink-0">
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
            {CATEGORY_ORDER.map(cat => {
              const reqs = (searchQuery.trim() ? filteredRequirementMap : requirementMap)[cat] || []
              if (reqs.length === 0) return null
              const isLocked = isSectionLocked(task, cat)
              const isExpanded = expandedCategories.has(cat)

              return (
                <React.Fragment key={cat}>
                  {/* Category Separator Row */}
                  <TableRow
                    className="bg-slate-50 hover:bg-slate-100 cursor-pointer transition-colors"
                    onClick={() => setExpandedCategories(prev => {
                      const next = new Set(prev)
                      if (next.has(cat)) next.delete(cat)
                      else next.add(cat)
                      return next
                    })}
                  >
                    <TableCell
                      colSpan={totalCols}
                      className="py-2.5 px-5 border-b border-slate-200 sticky left-0 z-20"
                    >
                      <div className="flex items-center gap-3">
                        {isExpanded ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
                        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-700">{CATEGORY_LABELS[cat]}</span>
                        <Badge variant="outline" className="text-xs font-medium rounded-full px-2.5 py-0.5 bg-white border-slate-200 text-slate-500">{reqs.length}</Badge>
                        {isLocked && <Badge className="bg-amber-50 text-amber-700 border-amber-200 text-[10px] rounded-full px-2.5 py-0.5"><Lock className="h-3 w-3 mr-1" />Locked</Badge>}
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
                    const stripeBg = idx % 2 === 1 ? "bg-slate-50/50" : "bg-white"

                    return (
                      <React.Fragment key={reqId}>
                        {/* Main Requirement Row */}
                        <TableRow
                          ref={(el) => { requirementRowRefs.current[String(reqId)] = el }}
                          className={cn(
                            "group transition-colors",
                            stripeBg, "hover:bg-blue-50/30",
                            highlightedRowId === reqId && "ring-2 ring-inset ring-blue-500 bg-blue-50/90 animate-pulse"
                          )}
                        >
                          <TableCell className={cn("w-12 py-0 px-0 text-center text-xs font-mono text-slate-400 border-b border-r border-slate-100 sticky left-0 z-10 align-middle", stripeBg, "group-hover:bg-blue-50/30")}>
                            <div className="flex items-center justify-center h-full font-medium">
                              {idx + 1}
                            </div>
                          </TableCell>

                          <TableCell className={cn("w-[400px] py-0 px-4 border-b border-r border-slate-100 sticky left-12 z-10 align-middle", stripeBg, "group-hover:bg-blue-50/30")}>
                            <div className="flex items-center gap-3 h-full py-3 justify-between">
                              <div className="flex flex-col min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[11px] font-semibold text-slate-800 line-clamp-2 leading-tight">
                                    <HighlightText text={req.name || req.display_name || "Untitled Requirement"} query={searchQuery} />
                                  </span>
                                  {req.web_automation?.automationId && (
                                    <button
                                      type="button"
                                      onClick={(e) => { e.stopPropagation(); window.open(`/dashboard/tasks/${task.id}?tab=automation&automationId=${req.web_automation.automationId}`, '_blank', 'noopener,noreferrer') }}
                                      className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-purple-600 text-white ring-1 ring-purple-100 hover:bg-purple-700 hover:ring-purple-200 transition-colors shrink-0"
                                      title={`Generated by automation: ${req.web_automation.automationName || 'View automation'}`}
                                    >
                                      <Zap className="h-3 w-3" fill="currentColor" />
                                    </button>
                                  )}
                                  {hasTemplateExplicitly && isTemplateEligible(req, docMeta) && (
                                    <button
                                      type="button"
                                      onClick={(e) => { e.stopPropagation(); window.open(`/dashboard/tasks/${task.id}?tab=templates&documentId=${req.document_id || req.document_ids?.[0]}`, '_blank', 'noopener,noreferrer') }}
                                      className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-blue-600 text-white ring-1 ring-blue-100 hover:bg-blue-700 hover:ring-blue-200 transition-colors shrink-0"
                                      title="Generate document from template"
                                    >
                                      <Wand2 className="h-3 w-3" />
                                    </button>
                                  )}
                                </div>
                                {hasTemplateExplicitly && isTemplateEligible(req, docMeta) && (() => {
                                  const progress = templateProgress[String(req.id)]
                                  if (!progress) return (
                                    <span className="text-[9px] text-slate-400 mt-1">Checking template...</span>
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
                                      <span className={cn("text-[9px] font-bold shrink-0", pct === 100 ? "text-emerald-600" : "text-slate-500")}>
                                        {progress.total > 0 ? `${progress.filled}/${progress.total}` : "N/A"}
                                      </span>
                                    </div>
                                  )
                                })()}
                                {isComposite && (
                                  <span className="text-[10px] font-medium text-blue-600 mt-1 uppercase tracking-wide">
                                    {docTypeInfo.count} Types
                                  </span>
                                )}
                              </div>
                              {isComposite ? (
                                <button
                                  className="p-1.5 bg-slate-50 hover:bg-slate-200 rounded-full transition-colors shrink-0 border border-slate-200"
                                  onClick={() => toggleCompositeExpansion(reqId)}
                                  title="Expand document types"
                                >
                                  {isCompExpanded ? <ChevronDown className="h-4 w-4 text-slate-600" /> : <ChevronRight className="h-4 w-4 text-slate-600" />}
                                </button>
                              ) : fieldsToRender.length > 0 ? (
                                <button
                                  className="p-1.5 bg-slate-50 hover:bg-slate-200 rounded-full transition-colors shrink-0 border border-slate-200"
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

                          <TableCell className={cn("max-w-[280px] py-0 px-5 border-b border-r border-slate-100 sticky left-[348px] z-10 align-middle", stripeBg, "group-hover:bg-blue-50/30")}>
                            <div className="flex flex-col gap-1.5 h-full justify-center py-3">
                              <span className="text-[11px] font-medium text-slate-700 line-clamp-2 leading-snug">
                                <HighlightText text={docTypeInfo?.primary?.display_name || docTypeInfo?.primary?.name || docName} query={searchQuery} />
                              </span>
                              {req.description && <span className="text-sm font-medium text-slate-500 line-clamp-2 leading-relaxed"><HighlightText text={req.description} query={searchQuery} /></span>}
                            </div>
                          </TableCell>

                          {columns.map(col => {
                            const status = getCellStatus(req, col, documentsByIndividual, allCompanyDocumentsMap)
                            const docIds = req.document_ids || (req.document_id ? [req.document_id] : [])
                            const latestDoc = status.docs.length > 0 ? getLatestDoc(status.docs) : null
                            const latestDocId = latestDoc?.document_id || docIds[0]
                            const statusKey = latestDocId ? `${task.id}-${latestDocId}-${col.type}-${col.id}` : null
                            const docStatus = statusKey ? documentStatusCache.get(statusKey) : null

                            return (
                              <TableCell key={col.id} className={cn("p-0 border-b border-r border-slate-100 align-middle transition-colors", stripeBg, "group-hover:bg-blue-50/20")}>
                                {status.type === "na" ? (
                                  <div className="flex h-full items-center justify-center p-3">
                                    <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wide italic">N/A</span>
                                  </div>
                                ) : (
                                  <div className="grid grid-cols-[90px_120px_1fr] h-full">
                                    <div className="p-3 border-r border-slate-100 flex items-center justify-center text-sm font-medium text-slate-600 text-center break-words">
                                      {status.type === 'view' ? (docStatus?.expiryDate || 'NO EXPIRY') : '-'}
                                    </div>
                                    <div className="p-3 border-r border-slate-100 flex items-center justify-center text-center">
                                      {status.type === 'view' ? (
                                        docStatus ? renderStatusBadge(docStatus) : <Loader2 className="h-4 w-4 animate-spin text-slate-300" />
                                      ) : (
                                        isLocked ? (
                                          <span className="text-xs font-medium text-red-600">Missing</span>
                                        ) : (
                                          <span className="text-xs font-medium text-amber-600">Pending</span>
                                        )
                                      )}
                                    </div>
                                    <div className="p-3 flex items-center justify-center text-center">
                                      {status.type === 'view' ? (
                                        <button className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-700 hover:underline" onClick={() => handlePreview(req, col, isLocked, isComposite ? latestDocId : undefined)}>
                                          <Eye className="h-4 w-4" /> View
                                        </button>
                                      ) : (
                                        isLocked ? (
                                          <span className="text-sm font-medium text-slate-400 uppercase tracking-wide">Locked</span>
                                        ) : (
                                          <Button
                                            variant="outline"
                                            size="sm"
                                            className="h-8 px-4 text-xs font-medium text-blue-600 bg-white hover:bg-blue-50 border-dashed border-blue-300 hover:border-blue-500 rounded-lg transition-all"
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
                            <TableRow key={`${reqId}-sub-${docIdx}`} className="bg-slate-50/60 hover:bg-slate-100/60 transition-colors">
                              <TableCell className="w-12 py-3 text-center text-sm font-medium font-mono text-slate-400 border-b border-r sticky left-0 bg-slate-50/95 z-10 align-middle">
                                {idx + 1}.{docIdx + 1}
                              </TableCell>
                              <TableCell className="w-[300px] py-3 border-b border-r sticky left-12 bg-slate-50/95 z-10 pl-14 pr-4 align-middle">
                                <span className="flex items-center gap-2">
                                  <FileText className="h-3.5 w-3.5 text-blue-400 shrink-0" />
                                  <span className="text-sm font-medium text-slate-700 leading-tight">{subDocMeta.display_name || subDocMeta.name}</span>
                                </span>
                              </TableCell>
                              <TableCell className="min-w-[280px] py-3 px-5 border-b border-r sticky left-[348px] bg-slate-50/95 z-10 align-middle" />
                              {columns.map(col => {
                                const subDocs = col.type === "company"
                                  ? (allCompanyDocumentsMap[col.id] || []).filter((d: any) => d.document_id === docId)
                                  : (documentsByIndividual[col.id] || []).filter((d: any) => d.document_id === docId)
                                const hasDocs = subDocs.length > 0
                                const subLatestDoc = hasDocs ? getLatestDoc(subDocs) : null
                                const subStatusKey = `${task.id}-${docId}-${col.type}-${col.id}`
                                const subDocStatus = documentStatusCache.get(subStatusKey)

                                return (
                                  <TableCell key={`${docId}-${col.id}`} className="p-0 border-b border-r align-middle bg-slate-50/50">
                                    {!checkApplicability(col.type, req) ? (
                                      <div className="flex h-full items-center justify-center p-2">
                                        <span className="text-sm font-medium text-slate-300">-</span>
                                      </div>
                                    ) : hasDocs ? (
                                      <div className="grid grid-cols-[90px_120px_1fr] h-full">
                                        <div className="p-2 border-r border-slate-200/60 flex items-center justify-center text-sm font-semibold text-slate-600 text-center break-words">
                                          {subDocStatus?.expiryDate || 'NO EXPIRY'}
                                        </div>
                                        <div className="p-2 border-r border-slate-200/60 flex items-center justify-center">
                                          {subDocStatus ? renderStatusBadge(subDocStatus) : <span className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />}
                                        </div>
                                        <div className="p-2 flex items-center justify-center">
                                          <Button variant="ghost" size="sm" className="h-7 px-3 text-[10px] font-medium text-blue-600 hover:bg-blue-100 rounded-full" onClick={() => handlePreview(req, col, isLocked, docId)}>
                                            <Eye className="h-3.5 w-3.5 mr-1.5" /> View
                                          </Button>
                                        </div>
                                      </div>
                                    ) : (
                                      <div className="flex h-full items-center justify-center p-2">
                                        <span className="text-sm font-medium text-slate-300">-</span>
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
                          <TableRow key={`${reqId}-field-${field.id || fIdx}`} className="bg-slate-50/60 hover:bg-slate-100/60 transition-colors">
                            <TableCell className="w-12 py-2.5 text-center text-[10px] font-medium font-mono text-slate-400 border-b border-r sticky left-0 bg-slate-50/95 z-10 align-middle">
                              {idx + 1}.{fIdx + 1}
                            </TableCell>
                            <TableCell className="w-[300px] py-2.5 border-b border-r sticky left-12 bg-slate-50/95 z-10 pl-14 pr-4 align-middle">
                              <span className="text-sm font-medium text-slate-500 italic">{field.name}</span>
                            </TableCell>
                            <TableCell className="min-w-[280px] py-2.5 border-b border-r sticky left-[348px] bg-slate-50/95 z-10 align-middle" />
                            {columns.map(col => {
                              const isApplicable = checkApplicability(col.type, req)
                              const docData = isApplicable ? getDocDataForReq(req, col, documentsByIndividual, allCompanyDocumentsMap) : null
                              return (
                                <TableCell key={`${field.id || fIdx}-${col.id}`} className="py-2.5 px-3 text-center border-b border-r align-middle bg-slate-50/30">
                                  {isApplicable ? (() => {
                                    const val = docData?.extracted_details?.[field.name]
                                    if (val === null || val === undefined) return <span className="text-sm text-slate-300 font-medium">-</span>
                                    if (typeof val === 'object') return <span className="text-sm font-semibold text-slate-600 bg-white px-2.5 py-1 rounded border">{JSON.stringify(val)}</span>
                                    return <span className="text-sm text-slate-800 font-medium bg-white px-3 py-1 rounded-md border inline-block max-w-full truncate">{String(val)}</span>
                                  })() : <span className="text-sm text-slate-300 font-medium">-</span>}
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
          <DialogContent className="max-w-[90vw] w-full max-h-[90vh] flex flex-col p-0 overflow-hidden">
            <div className="flex-1 overflow-y-auto p-6 bg-slate-50">
              {previewDocument.documents.map((doc: any) => (
                <ExtractionPreview
                  key={doc.id}
                  documentName={doc.name}
                  extractedData={doc.extractedData}
                  fields={doc.fields}
                  fileUrl={doc.fileUrl}
                  expanded={true}
                  showSaveButton={!previewDocument.locked}
                  onDelete={() => handleDeleteDocument(doc.originalDoc)}
                  onDialogClose={() => setPreviewDialogOpen(false)}
                />
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