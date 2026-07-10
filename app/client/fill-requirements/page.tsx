// @ts-nocheck
"use client"

import React, { Suspense, useEffect, useMemo, useState, useRef } from "react"
import { useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { SearchableSelect } from "@/components/ui/searchable-select"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import {
  FileText, Loader2, Eye, Check, X, CheckCircle2, ShieldCheck, UploadCloud, 
  AlertCircle, Briefcase, User, UserCheck, Users2, HeartPulse, LayoutDashboard,
  Lock, Database, HelpCircle, Plus, Trash2,
  FileCheck2, ChevronDown, ChevronRight, Calendar
} from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ExtractionPreview } from "@/components/ExtractionPreview"
import supabase from "@/lib/supabase/client"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import {
  resolveTargetEntityIdImpl,
  resolveVariableValueImpl,
  getArrayFieldDataImpl,
  fetchSourceDataImpl,
} from "@/app/(dashboard)/dashboard/tasks/utils/fieldResolution"

// -- Helper: Modern Input Styling --
const fieldContainerClass = "group flex flex-col gap-1.5 p-4 rounded-xl border border-transparent transition-all duration-200 hover:bg-slate-50/50"
const inputBaseClass = "rounded-lg font-medium transition-all duration-200 border w-full focus:ring-2 focus:ring-blue-100"
const inputHighlightClass = (hasValue: boolean) => cn(
  inputBaseClass,
  hasValue 
    ? "bg-emerald-50/40 border-emerald-200 text-emerald-900 shadow-sm" 
    : "bg-white border-slate-200"
)

// -- Components --

const SectionHeader = ({ icon: Icon, title, count, colorClass }: any) => (
  <div className="flex items-center gap-3 mb-6 px-2">
    <div className={cn("p-2 rounded-xl shadow-sm", colorClass)}>
      <Icon className="h-5 w-5" />
    </div>
    <div>
      <h2 className="text-lg font-bold text-slate-800 leading-none">{title}</h2>
      {count !== undefined && <p className="text-[11px] font-bold text-slate-400 uppercase mt-1 tracking-wider">{count} Items Pending</p>}
    </div>
  </div>
)

const getTaskName = (task: any) => {
  if (task?.applicant_details?.name) return task.applicant_details.name
  const principal = task?.participants_details?.find((p: any) => p.type === "individual" && (Array.isArray(p.role) ? p.role.includes("principal") : p.role === "principal"))
  return principal?.name || task?.title || "Client"
}

const normalizeDocIds = (req: any) => req?.document_ids || (req?.document_id ? [req.document_id] : [])
const getRequiredCount = (req: any) => req?.requiredDocumentCount || 1

function humanizeVariableName(name: string): string {
  if (!name) return "Field"
  return name.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim().replace(/\b\w/g, (c) => c.toUpperCase())
}

function getFieldLabel(field: any): string {
  return field?.efnsDisplayName || field?.name || humanizeVariableName(field?.variableName) || "Field"
}

function isValidExistingValue(val: any): boolean {
  return val !== null && val !== undefined && val !== "" && val !== "Missing"
}

const ENTITY_TYPE_CONFIG = {
  company: { bgColor: "bg-slate-700", Icon: Briefcase, label: "Company" },
  director: { bgColor: "bg-indigo-600", Icon: UserCheck, label: "Director" },
  principal: { bgColor: "bg-blue-700", Icon: User, label: "Principal" },
  dependant: { bgColor: "bg-blue-500", Icon: Users2, label: "Dependant" },
  sponsor: { bgColor: "bg-emerald-600", Icon: HeartPulse, label: "Sponsor" },
  understudy: { bgColor: "bg-cyan-600", Icon: User, label: "Understudy" },
}

function getEntityBadges(entityTypes: string[]) {
  return (entityTypes || []).map((et: string) => {
    const cfg = ENTITY_TYPE_CONFIG[et.toLowerCase()] || { bgColor: "bg-blue-600", Icon: User, label: et }
    return { ...cfg, type: et }
  })
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

function isApplicableToCol(entityTypes: string[], col: ColDef): boolean {
  if (!entityTypes || entityTypes.length === 0) return true
  const lowerEntityTypes = entityTypes.map((t: string) => String(t).toLowerCase())
  const colType = String(col.type).toLowerCase()
  const colRoles = (col.roles || []).map((r: string) => String(r).toLowerCase())
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

const generateId = () => Math.random().toString(36).substr(2, 9)

function ClientFillRequirementsContent() {
  const searchParams = useSearchParams()
  const taskId = searchParams.get("taskId")
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({})
  
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [task, setTask] = useState<any>(null)
  const [requirements, setRequirements] = useState<any[]>([])
  const [questions, setQuestions] = useState<any[]>([])
  const [automations, setAutomations] = useState<Record<string, any>>({})
  const [jobFields, setJobFields] = useState<Record<string, any>>({})
  const [documentsMeta, setDocumentsMeta] = useState<Record<string, any>>({})
  const [answers, setAnswers] = useState<Record<string, any>>({})
  const [fieldValues, setFieldValues] = useState<Record<string, any>>({})
  const [arrayFieldValues, setArrayFieldValues] = useState<Record<string, Array<Record<string, any>>>>({})
  const [docFiles, setDocFiles] = useState<Record<string, Array<{ file: File, docId: string }>>>({})
  const [selectedReqDocs, setSelectedReqDocs] = useState<Record<string, string>>({})
  const [submitted, setSubmitted] = useState(false)
  const [fieldSourceDataCache, setFieldSourceDataCache] = useState<Record<string, Record<string, any>>>({})
  const [fieldMasterComputedCache, setFieldMasterComputedCache] = useState<Record<string, any>>({})
  const [existingDocsByEntity, setExistingDocsByEntity] = useState<Record<string, any[]>>({})
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({})
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false)
  const [previewDocument, setPreviewDocument] = useState<any>(null)
  const [expandedMultiDocs, setExpandedMultiDocs] = useState<Set<string>>(new Set())
  const prefilledRef = useRef(false)

  // Logic remains identical to original for data integrity
  useEffect(() => {
    const load = async () => {
      if (!taskId) { setLoading(false); return }
      try {
        setLoading(true)
        const { data: taskData, error: taskError } = await supabase.from("tm_tasks").select("*").eq("id", taskId).single()
        if (taskError) throw taskError
        setTask(taskData)
        setAnswers(taskData.job_specific_answers || {})

        const { data: classReqs } = await supabase.from("tm_class_requirements").select("*")
        const jobLevel = taskData.job_level || {}
        const matchingRequirements = (classReqs || []).filter((req: any) => {
          const rjl = req.job_level || {}
          if (String(rjl.department_id) === String(jobLevel.department_id) && String(rjl.subdepartment_id) === String(jobLevel.subdepartment_id) && String(rjl.class_id || 'null') === String(jobLevel.class_id || 'null') && String(rjl.subclass_id || 'null') === String(jobLevel.subclass_id || 'null')) return true
          if (jobLevel.subclass_id && !rjl.subclass_id && String(rjl.department_id) === String(jobLevel.department_id) && String(rjl.subdepartment_id) === String(jobLevel.subdepartment_id) && String(rjl.class_id || 'null') === String(jobLevel.class_id || 'null')) return true
          if (jobLevel.class_id && !rjl.class_id && String(rjl.department_id) === String(jobLevel.department_id) && String(rjl.subdepartment_id) === String(jobLevel.subdepartment_id)) return true
          return false
        })

        const allReqs: any[] = []
        const allQuestions: any[] = []
        matchingRequirements.forEach((req: any) => {
          if (req.requirements) allReqs.push(...req.requirements)
          if (req.job_specific_questions) allQuestions.push(...req.job_specific_questions)
        })

        const reqList = allReqs.filter((req: any) => req.is_client_requirement)
        const questionList = allQuestions.filter((q: any) => q.is_client_requirement)
        setRequirements(reqList)
        setQuestions(questionList)

        const docIds = new Set<string>()
        reqList.forEach((req: any) => normalizeDocIds(req).forEach((id: string) => docIds.add(id)))
        if (docIds.size > 0) {
          const { data: docs } = await supabase.from("acc_portal_kyc").select("id, name, display_name, fields").in("id", Array.from(docIds))
          setDocumentsMeta((docs || []).reduce((acc: any, doc: any) => ({ ...acc, [doc.id]: doc }), {}))
        }

        const automationIds = new Set<string>()
        allReqs.forEach((req: any) => { if (req.web_automation?.automationId) automationIds.add(req.web_automation.automationId) })
        if (automationIds.size > 0) {
          const { data: autoData } = await supabase.from("tm_automations").select("id, name, webdata").in("id", Array.from(automationIds))
          setAutomations((autoData || []).reduce((acc: any, auto: any) => ({ ...acc, [auto.id]: auto }), {}))
          const linkedFieldIds = new Set<string>()
          ;(autoData || []).forEach((auto: any) => {
            ;(auto.webdata || []).forEach((field: any) => {
              ;(field.linkedMasterFields || field.masterFieldIds || []).forEach((id: any) => linkedFieldIds.add(String(id)))
              ;(field.arrayItems || []).forEach((item: any) => { ;(item.linkedMasterFields || item.masterFieldIds || (item.linkedMasterFieldId ? [item.linkedMasterFieldId] : [])).forEach((id: any) => linkedFieldIds.add(String(id))) })
            })
          })
          if (linkedFieldIds.size > 0) {
            const { data: fields } = await supabase.from('tm_job_fields').select('*').in('id', Array.from(linkedFieldIds))
            if (fields) setJobFields(fields.reduce((acc: any, f: any) => ({ ...acc, [String(f.id)]: f }), {}))
          }
        }
      } catch (error: any) { toast.error("Failed to load requirements") } finally { setLoading(false) }
    }
    load()
  }, [taskId])

  const columns = useMemo(() => buildParticipantColumns(task), [task])

  const clientFields = useMemo(() => {
    const rows: any[] = []
    Object.entries(automations).forEach(([autoId, auto]: [string, any]) => {
      ;(auto.webdata || []).forEach((field: any) => {
        if (field.is_client_requirement && !["document", "computed", "array"].includes(field.fieldType)) {
          rows.push({ ...field, options: getFieldOptions(field, jobFields), automationId: autoId, automationName: auto.name, key: `${autoId}:${field.variableName}` })
        }
      })
    })
    return rows
  }, [automations, jobFields])

  const clientArrayFields = useMemo(() => {
    const rows: any[] = []
    Object.entries(automations).forEach(([autoId, auto]: [string, any]) => {
      ;(auto.webdata || []).forEach((field: any) => {
        if (field.is_client_requirement && field.fieldType === "array") {
          rows.push({ ...field, arrayItems: (field.arrayItems || []).map((item: any) => ({ ...item, options: getFieldOptions(item, jobFields) })), automationId: autoId, automationName: auto.name, key: `${autoId}:${field.variableName}` })
        }
      })
    })
    return rows
  }, [automations, jobFields])

  const relationshipData = useMemo(() => {
    if (!task) return null
    const participants = task.participants_details || []
    const applicant = task.applicant_details || {}
    let principal = participants.find((p: any) => p.type === 'individual' && (Array.isArray(p.role) ? p.role.includes('principal') : p.role === 'principal'))
    let dependants = participants.filter((p: any) => p.type === 'individual' && (Array.isArray(p.role) ? p.role.includes('dependant') : p.role === 'dependant')).map((dep: any) => ({ id: dep.id, name: dep.name, relationship: dep.relationship || 'dependant' }))
    if (!principal) principal = { id: applicant.id || task?.individual_id, name: applicant.name, role: applicant.role }
    return {
      company: { id: task?.company_id, name: task?.company_name || 'Company', type: 'company' },
      principal: principal ? { id: principal.id, name: principal.name, role: principal.role } : null,
      directors: participants.filter((p: any) => p.type === 'individual' && (Array.isArray(p.role) ? (p.role.includes('director') || p.role.includes('shareholder')) : (p.role === 'director' || p.role === 'shareholder'))).map((d: any) => ({ id: d.id, name: d.name, role: d.role })),
      dependants,
      understudy: (() => { const up = participants.find((p: any) => p.type === 'individual' && (Array.isArray(p.role) ? p.role.includes('understudy') : p.role === 'understudy')); return up ? { id: up.id, name: up.name } : null })(),
      sponsor: (() => { const sp = participants.find((p: any) => p.type === 'individual' && (Array.isArray(p.role) ? p.role.includes('sponsor') : p.role === 'sponsor')); return sp ? { id: sp.id, name: sp.name } : null })()
    }
  }, [task])

  useEffect(() => {
    if (!task || !relationshipData || Object.keys(jobFields).length === 0 || Object.keys(automations).length === 0) return
    const loadAll = async () => {
      const mergedSource: Record<string, Record<string, any>> = {}
      const mergedComputed: Record<string, any> = {}
      const calls: Promise<void>[] = []
      Object.entries(automations).forEach(([autoId, auto]: [string, any]) => {
        if (!auto.webdata?.length) return
        calls.push(fetchSourceDataImpl({
            selectedAutomationId: String(autoId), webData: [{ automationId: String(autoId), fields: auto.webdata }],
            jobFields, relationshipData, taskId: String(task.id || ""), currentIndividualId: String(task.individual_id || ""), task
          }).then(({ sourceData: sd, masterFieldComputedValues: mc }) => {
            Object.entries(sd).forEach(([table, records]) => { if (!mergedSource[table]) mergedSource[table] = {}; Object.assign(mergedSource[table], records) })
            if (mc) Object.assign(mergedComputed, mc)
          }).catch(() => null))
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
  }, [task, relationshipData, jobFields, automations])

  useEffect(() => {
    if (prefilledRef.current) return
    if (Object.keys(fieldSourceDataCache).length === 0 && Object.keys(fieldMasterComputedCache).length === 0) return
    if (clientFields.length === 0 && clientArrayFields.length === 0) return
    prefilledRef.current = true
    const buildCtx = (automationId: string, fields: any[]) => ({
      sourceData: fieldSourceDataCache, jobFields, webData: [{ automationId, fields }], selectedAutomationId: automationId,
      masterFieldComputedValues: fieldMasterComputedCache, relationshipData, taskId: String(task?.id || ""), currentIndividualId: String(task?.individual_id || ""), task,
    })
    const scalarDefaults: Record<string, any> = {}
    clientFields.forEach((field: any) => {
      const ctx = buildCtx(field.automationId, [field])
      const targetEntityId = resolveTargetEntityIdImpl(field, ctx)
      if (targetEntityId == null) return
      const val = resolveVariableValueImpl(field, String(targetEntityId), ctx)
      if (isValidExistingValue(val)) scalarDefaults[field.key] = val
    })
    if (Object.keys(scalarDefaults).length > 0) setFieldValues(prev => ({ ...scalarDefaults, ...prev }))
    const arrayDefaults: Record<string, Array<Record<string, any>>> = {}
    clientArrayFields.forEach((field: any) => {
      const ctx = buildCtx(field.automationId, [field])
      const rows = getArrayFieldDataImpl(field, ctx) || []
      rows.forEach((row: any) => {
        const col = columns.find((c: ColDef) => String(c.id) === String(row.entityId))
        if (!col) return
        const slotKey = `${field.key}::${col.id}`
        const values: Record<string, any> = { _id: generateId() }
        ;(field.arrayItems || []).forEach((item: any) => {
          if (isValidExistingValue(row[item.variableName])) values[item.variableName] = row[item.variableName]
        })
        if (!arrayDefaults[slotKey]) arrayDefaults[slotKey] = []
        arrayDefaults[slotKey].push(values)
      })
      const entityTypes = field.entityTypes || (field.entityType ? [field.entityType] : [])
      const applicableCols = columns.filter((col: ColDef) => isApplicableToCol(entityTypes, col))
      const slots = applicableCols.length > 0 ? applicableCols : [{ type: "individual", id: "primary", label: getTaskName(task), subLabel: "" } as ColDef]
      slots.forEach((col: ColDef) => {
        const slotKey = `${field.key}::${col.id}`
        if (!arrayDefaults[slotKey] || arrayDefaults[slotKey].length === 0) {
          arrayDefaults[slotKey] = [{ _id: generateId() }]
        }
      })
    })
    setArrayFieldValues(prev => ({ ...arrayDefaults, ...prev }))
  }, [fieldSourceDataCache, fieldMasterComputedCache, clientFields, clientArrayFields, columns, jobFields, relationshipData, task])

  useEffect(() => {
    if (!task || columns.length === 0 || requirements.length === 0) return
    const loadExistingDocs = async () => {
      const docIdSet = new Set<string>()
      requirements.forEach((req: any) => normalizeDocIds(req).forEach((id: string) => docIdSet.add(id)))
      if (docIdSet.size === 0) return
      const docIdList = Array.from(docIdSet)
      const personIds = columns.filter((c: ColDef) => c.type !== 'company').map((c: ColDef) => c.id)
      const companyIds = columns.filter((c: ColDef) => c.type === 'company').map((c: ColDef) => c.id)
      const results: Record<string, any[]> = {}
      const addDoc = (key: any, doc: any) => { const k = String(key); if (!results[k]) results[k] = []; results[k].push(doc) }
      if (personIds.length > 0) {
        const { data } = await supabase.from('acc_portal_directors_documents').select('*').in('director_id', personIds).in('document_id', docIdList).neq('status', 'deleted')
        ;(data || []).forEach((d: any) => addDoc(d.director_id, d))
      }
      if (companyIds.length > 0) {
        const { data } = await supabase.from('acc_portal_kyc_uploads').select('*').in('company_id', companyIds).in('document_id', docIdList).neq('status', 'deleted')
        ;(data || []).forEach((d: any) => addDoc(d.company_id, d))
      }
      setExistingDocsByEntity(results)
      const allDocs = Object.values(results).flat()
      if (allDocs.length === 0) return
      const urlEntries = await Promise.all(allDocs.map(async (d: any) => {
        if (!d.file_path) return null
        const { data: signData } = await supabase.storage.from('kyc-documents').createSignedUrl(d.file_path, 3600)
        return signData?.signedUrl ? [String(d.id), signData.signedUrl] as const : null
      }))
      setSignedUrls(Object.fromEntries(urlEntries.filter(Boolean) as [string, string][]))
    }
    loadExistingDocs()
  }, [task, columns, requirements])

  const getExistingDocsForReq = (docIds: string[], col: ColDef) => {
    const docs = existingDocsByEntity[String(col.id)] || []
    return docs.filter((d: any) => docIds.includes(d.document_id)).sort((a: any, b: any) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
  }
  const getExistingDocForReq = (docIds: string[], col: ColDef) => getExistingDocsForReq(docIds, col)[0] || null

  const handleDocPreview = async (docIds: string[], col: ColDef) => {
    const docs = existingDocsByEntity[String(col.id)] || []
    const matched = docs.filter((d: any) => docIds.includes(d.document_id))
    if (matched.length === 0) return
    try {
      const previews = await Promise.all(matched.map(async (doc: any) => {
        const { data: signData } = await supabase.storage.from('kyc-documents').createSignedUrl(doc.file_path, 3600)
        let fields: any[] = []
        if (doc.document_id) {
          const { data: kycData } = await supabase.from('acc_portal_kyc').select('fields').eq('id', doc.document_id).single()
          if (kycData) fields = kycData.fields || []
        }
        return { id: doc.id, fileUrl: signData?.signedUrl, extractedData: doc.extracted_details || {}, fields, name: documentsMeta[doc.document_id]?.display_name || documentsMeta[doc.document_id]?.name || 'Document', originalDoc: doc }
      }))
      setPreviewDocument({ documents: previews.filter(Boolean), currentIndex: 0 })
      setPreviewDialogOpen(true)
    } catch { toast.error('Failed to load preview') }
  }

  const toggleMultiDoc = (slotKey: string) => {
    setExpandedMultiDocs(prev => {
      const next = new Set(prev)
      if (next.has(slotKey)) next.delete(slotKey)
      else next.add(slotKey)
      return next
    })
  }

  const requirementRows = useMemo(() => {
    const rows: any[] = []
    requirements.forEach((req: any) => {
      const docIds = normalizeDocIds(req)
      const entityTypes = req.entityTypes || (req.entityType ? [req.entityType] : [])
      const applicableCols = columns.filter((col: ColDef) => isApplicableToCol(entityTypes, col))
      const slots = applicableCols.length > 0 ? applicableCols : [{ type: "individual", id: "primary", label: getTaskName(task), subLabel: "" } as ColDef]
      slots.forEach((col: ColDef) => {
        const slotKey = `${req.id || req.name}::${col.id}`
        rows.push({ req, docIds, col, slotKey })
      })
    })
    return rows
  }, [requirements, columns, task])

  useEffect(() => {
    const nextSelected = { ...selectedReqDocs }
    let changed = false
    requirementRows.forEach(({ docIds, col, slotKey }) => {
      const existing = getExistingDocForReq(docIds, col)
      if (existing && existing.document_id && nextSelected[slotKey] !== existing.document_id) {
        nextSelected[slotKey] = existing.document_id
        changed = true
      }
    })
    if (changed) setSelectedReqDocs(nextSelected)
  }, [requirementRows, existingDocsByEntity])

  const updateArrayFieldValue = (slotKey: string, rowIndex: number, itemVar: string, value: any) => {
    setArrayFieldValues(prev => {
      const next = { ...prev }; const rows = [...(next[slotKey] || [])]
      if (rows[rowIndex]) rows[rowIndex] = { ...rows[rowIndex], [itemVar]: value }
      next[slotKey] = rows; return next
    })
  }
  const addArrayRow = (slotKey: string) => setArrayFieldValues(prev => ({ ...prev, [slotKey]: [...(prev[slotKey] || []), { _id: generateId() }] }))
  const removeArrayRow = (slotKey: string, rowIndex: number) => {
    setArrayFieldValues(prev => {
      const next = { ...prev }; const rows = [...(next[slotKey] || [])]
      rows.splice(rowIndex, 1); next[slotKey] = rows; return next
    })
  }

  const stats = useMemo(() => {
    let total = 0, completed = 0
    total += requirementRows.length
    requirementRows.forEach(row => {
      const requiredCount = getRequiredCount(row.req)
      const uploadedCount = (docFiles[row.slotKey] || []).length + getExistingDocsForReq(row.docIds, row.col).length
      if (uploadedCount >= requiredCount) completed++
    })
    total += clientFields.length
    clientFields.forEach(f => { if (isValidExistingValue(fieldValues[f.key])) completed++ })
    clientArrayFields.forEach(f => {
      const entityTypes = f.entityTypes || (f.entityType ? [f.entityType] : [])
      const applicableCols = columns.filter(col => isApplicableToCol(entityTypes, col))
      const slots = applicableCols.length > 0 ? applicableCols : [{ id: "primary" } as ColDef]
      total += slots.length
      slots.forEach(col => {
        const slotKey = `${f.key}::${col.id}`
        const rowValuesArr = arrayFieldValues[slotKey] || []
        const hasData = rowValuesArr.some(rowValues => (f.arrayItems || []).some((item:any) => isValidExistingValue(rowValues[item.variableName])))
        if (hasData) completed++
      })
    })
    total += questions.length
    questions.forEach(q => { if (isValidExistingValue(answers[q.id])) completed++ })
    return { total, completed, percent: total > 0 ? Math.round((completed / total) * 100) : 0 }
  }, [requirementRows, docFiles, existingDocsByEntity, clientFields, fieldValues, clientArrayFields, arrayFieldValues, questions, answers, columns])

  const handleSubmit = async () => {
    if (!task || !taskId) return
    setSubmitting(true)
    const toastId = toast.loading("Submitting requirements...")
    try {
      const documents: any[] = []
      for (const [slotKey, files] of Object.entries(docFiles)) {
        if (!files || files.length === 0) continue
        const [, colId] = slotKey.split("::")
        const col = columns.find((c: ColDef) => String(c.id) === String(colId))
        for (const data of files) {
          if (!data?.file || !data?.docId) continue
          const safeName = data.file.name.replace(/[^a-zA-Z0-9._-]/g, "_")
          const filePath = `client-requirements/${taskId}/${Date.now()}-${safeName}`
          const { error: uploadError } = await supabase.storage.from("kyc-documents").upload(filePath, data.file, { upsert: true })
          if (uploadError) throw uploadError
          documents.push({ document_id: data.docId, entity_id: col?.id ?? colId, entity_type: col?.type || "individual", entity_label: col?.label || "", file_name: data.file.name, file_path: filePath, status: "submitted", submitted_at: new Date().toISOString() })
        }
      }
      const fieldMetadata: Record<string, any> = {}
      Object.entries(fieldValues).forEach(([key, value]) => {
        const parts = key.split(':'); const autoId = parts[0]; const varName = parts.slice(1).join(':')
        const auto = automations[autoId]; const fieldDef = auto?.webdata?.find((f: any) => f.variableName === varName)
        if (fieldDef) { fieldMetadata[key] = { value, automationId: autoId, automationName: auto?.name, variableName: varName, fieldType: fieldDef.fieldType, entityTypes: fieldDef.entityTypes || (fieldDef.entityType ? [fieldDef.entityType] : []), masterFieldIds: fieldDef.linkedMasterFields || fieldDef.masterFieldIds || [] } }
      })
      clientArrayFields.forEach((field: any) => {
        const entityTypes = field.entityTypes || (field.entityType ? [field.entityType] : [])
        const applicableCols = columns.filter((col: ColDef) => isApplicableToCol(entityTypes, col))
        const slots = applicableCols.length > 0 ? applicableCols : [{ type: "individual", id: "primary", label: getTaskName(task), subLabel: "" } as ColDef]
        const rows: any[] = []
        slots.forEach((col: ColDef) => {
          const slotKey = `${field.key}::${col.id}`
          const rowValuesArr = arrayFieldValues[slotKey] || []
          rowValuesArr.forEach(rowValues => {
            if ((field.arrayItems || []).some((item:any) => isValidExistingValue(rowValues[item.variableName]))) {
              const cleanRow = { ...rowValues, entityId: col.id, entityLabel: col.label }; delete cleanRow._id; rows.push(cleanRow)
            }
          })
        })
        if (rows.length > 0) { fieldMetadata[field.key] = { value: rows, automationId: field.automationId, automationName: field.automationName, variableName: field.variableName, fieldType: "array", entityTypes, arrayItems: (field.arrayItems || []).map((item: any) => ({ variableName: item.variableName, name: item.efnsDisplayName || item.name || item.variableName, masterFieldIds: item.linkedMasterFields || item.masterFieldIds || [] })), } }
      })
      const draft = { status: "submitted", submitted_at: new Date().toISOString(), documents, questions: answers, fields: fieldMetadata }
      const { error } = await supabase.from("tm_tasks").update({ registry_metadata: { ...(task.registry_metadata || {}), client_requirements_draft: draft }, updated_at: new Date().toISOString() }).eq("id", taskId)
      if (error) throw error
      setSubmitted(true); toast.success("Submitted successfully", { id: toastId })
    } catch { toast.error("Failed to submit", { id: toastId }) } finally { setSubmitting(false) }
  }

  if (loading) {
    return (
      <main className="fixed inset-0 bg-white flex items-center justify-center z-[100]">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-10 w-10 animate-spin text-blue-600" />
          <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">Loading Portal...</p>
        </div>
      </main>
    )
  }

  if (!taskId || !task) {
    return (
      <main className="fixed inset-0 bg-slate-50 flex items-center justify-center p-6 z-[100]">
        <div className="bg-white rounded-3xl shadow-xl p-10 max-w-sm w-full text-center border border-slate-200">
          <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Link Invalid</h1>
          <p className="text-slate-500 font-medium">This secure link is invalid or has expired.</p>
        </div>
      </main>
    )
  }

  if (submitted) {
    return (
      <main className="fixed inset-0 bg-slate-50 flex items-center justify-center p-6 z-[100]">
        <div className="bg-white rounded-3xl shadow-xl p-12 max-w-md w-full text-center space-y-5 border border-slate-200">
          <div className="w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-2 border-4 border-emerald-100">
            <CheckCircle2 className="h-10 w-10 text-emerald-600" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Successfully Submitted</h1>
          <p className="text-slate-500 font-medium leading-relaxed">Your information has been securely transmitted and is now being reviewed by our team.</p>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-slate-50 flex flex-col items-center p-0 sm:p-6 md:p-10">
      <div className="w-full max-w-5xl bg-white sm:rounded-[2.5rem] shadow-xl shadow-slate-200/60 flex flex-col overflow-hidden border border-slate-200 relative">
        
        {/* Simplified Header */}
        <header className="px-6 py-8 sm:px-10 sm:py-10 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-5">
            <div className="h-14 w-14 bg-slate-900 rounded-2xl flex items-center justify-center text-white shadow-lg shrink-0">
              <LayoutDashboard className="h-7 w-7" />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h1 className="text-2xl font-black text-slate-900 tracking-tight">Onboarding</h1>
                <Badge variant="secondary" className="bg-blue-50 text-blue-700 border-blue-100 font-bold uppercase text-[10px]">Portal</Badge>
              </div>
              <div className="flex items-center gap-3 text-slate-500">
                <span className="text-sm font-bold text-slate-700">{getTaskName(task)}</span>
                <span className="h-1 w-1 rounded-full bg-slate-300" />
                <span className="text-[11px] font-bold uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
                  <Lock className="h-3 w-3" /> Secure AES-256
                </span>
              </div>
            </div>
          </div>

          <div className="md:w-64 space-y-2">
            <div className="flex justify-between items-end">
              <span className="text-[10px] uppercase font-black text-slate-400 tracking-tighter">Progress</span>
              <span className="text-sm font-black text-slate-900">{stats.percent}%</span>
            </div>
            <Progress value={stats.percent} className="h-2 bg-slate-100" indicatorClassName={stats.percent === 100 ? "bg-emerald-500" : "bg-blue-600"} />
          </div>
        </header>

        {/* Content Area */}
        <div className="flex-1 px-6 py-8 sm:px-10 sm:py-12 space-y-16">
          
          {/* Documents Section */}
          {requirementRows.length > 0 && (
            <section>
              <SectionHeader icon={FileText} title="Required Documents" count={requirementRows.length - stats.completed} colorClass="bg-blue-50 text-blue-600" />
              <div className="grid grid-cols-1 gap-3">
                {requirementRows.map(({ req, docIds, col, slotKey }) => {
                  const activeDocId = selectedReqDocs[slotKey] || docIds[0]
                  const requiredCount = getRequiredCount(req)
                  const existingDocs = getExistingDocsForReq(docIds, col)
                  const existingDoc = existingDocs[0] || null
                  const newFiles = docFiles[slotKey] || []
                  const uploadedCount = existingDocs.length + newFiles.length
                  const isReplacing = newFiles.length > 0
                  const hasData = requiredCount > 1 ? uploadedCount >= requiredCount : (isReplacing || !!existingDoc)
                  const isMultiDoc = docIds.length > 1
                  const isExpanded = expandedMultiDocs.has(slotKey)

                  return (
                    <div key={slotKey} className={cn(
                      "group rounded-2xl border transition-all duration-300",
                      hasData ? "bg-emerald-50/20 border-emerald-100" : "bg-white border-slate-200 hover:border-blue-200"
                    )}>
                      <div className="flex flex-col sm:flex-row sm:items-center gap-4 p-5">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-bold text-slate-900">{req.name}</span>
                            <Badge variant="outline" className="text-[9px] font-black uppercase px-1.5 py-0 border-slate-200 text-slate-500 bg-white">{col.label}</Badge>
                          </div>
                          
                          {isMultiDoc && (
                            <button onClick={() => toggleMultiDoc(slotKey)} className="text-[11px] font-bold text-blue-600 hover:underline flex items-center gap-1">
                              {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                              Accepted: {docIds.length} Types
                            </button>
                          )}

                          {isExpanded && isMultiDoc && (
                            <div className="mt-3 space-y-1 pl-2">
                              {docIds.map((id) => (
                                <div key={id} className={cn("text-[11px] font-medium p-1.5 rounded-lg border", activeDocId === id ? "bg-blue-50 border-blue-100 text-blue-700" : "text-slate-500 border-transparent")}>
                                  {documentsMeta[id]?.display_name || documentsMeta[id]?.name}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-2 self-end sm:self-center">
                          {existingDoc && !isReplacing && signedUrls[existingDoc.id] && (
                            <Button variant="ghost" size="sm" onClick={() => handleDocPreview(docIds, col)} className="h-9 text-blue-600 hover:bg-blue-50 font-bold px-3">
                              <Eye className="h-4 w-4 mr-1.5" /> Preview
                            </Button>
                          )}
                          <input type="file" className="hidden" ref={el => fileInputRefs.current[slotKey] = el} onChange={(e) => {
                            const file = e.target.files?.[0]; if (!file) return
                            setDocFiles(prev => ({ ...prev, [slotKey]: requiredCount > 1 ? [...(prev[slotKey] || []), { file, docId: activeDocId }] : [{ file, docId: activeDocId }] }))
                            e.target.value = ''
                          }}/>
                          <Button 
                            onClick={() => fileInputRefs.current[slotKey]?.click()}
                            className={cn("h-10 px-5 rounded-xl font-bold shadow-sm transition-all", hasData ? "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50" : "bg-blue-600 text-white hover:bg-blue-700")}
                          >
                            <UploadCloud className="h-4 w-4 mr-2" />
                            {hasData ? 'Replace' : 'Upload'}
                          </Button>
                        </div>
                      </div>

                      {/* File feedback tray */}
                      {(newFiles.length > 0 || existingDocs.length > 0) && (
                        <div className="px-5 pb-4 pt-0 flex flex-wrap gap-2">
                           {existingDocs.map((d: any) => (
                             <div key={d.id} className="flex items-center gap-2 bg-white border border-emerald-100 px-3 py-1.5 rounded-lg">
                               <FileCheck2 className="h-3 w-3 text-emerald-500" />
                               <span className="text-[11px] font-bold text-slate-600 truncate max-w-[120px]">{d.file_name}</span>
                             </div>
                           ))}
                           {newFiles.map((f, i) => (
                             <div key={i} className="flex items-center gap-2 bg-blue-50 border border-blue-100 px-3 py-1.5 rounded-lg">
                               <CheckCircle2 className="h-3 w-3 text-blue-500" />
                               <span className="text-[11px] font-bold text-blue-700 truncate max-w-[120px]">{f.file.name}</span>
                               <button onClick={() => setDocFiles(prev => { const next = {...prev}; next[slotKey] = next[slotKey].filter((_,idx)=>idx!==i); return next })}><X className="h-3 w-3 text-blue-400 hover:text-red-500"/></button>
                             </div>
                           ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </section>
          )}

          {/* Profile Section - Refactored to Grid */}
          {clientFields.length > 0 && (
            <section>
              <SectionHeader icon={Database} title="Profile Details" colorClass="bg-indigo-50 text-indigo-600" />
              <div className="bg-white border border-slate-100 rounded-3xl p-2 sm:p-6 shadow-sm">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2">
                  {clientFields.map((field: any) => {
                    const hasValue = isValidExistingValue(fieldValues[field.key])
                    const badges = getEntityBadges(field.entityTypes || (field.entityType ? [field.entityType] : []))
                    return (
                      <div key={field.key} className={fieldContainerClass}>
                        <div className="flex items-center justify-between">
                          <label className="text-[11px] font-black uppercase text-slate-400 tracking-tight">{getFieldLabel(field)}</label>
                          <div className="flex gap-1">
                            {badges.map((b:any) => <b.Icon key={b.type} className="h-3 w-3 text-slate-300" />)}
                          </div>
                        </div>
                        {field.options && field.options.length > 0 ? (
                          <SearchableSelect
                            value={fieldValues[field.key] || ""}
                            onValueChange={(val) => setFieldValues(prev => ({ ...prev, [field.key]: val }))}
                            options={field.options}
                            placeholder="Select..."
                            buttonClassName={cn("h-11", inputHighlightClass(hasValue))}
                          />
                        ) : (
                          <Input
                            value={fieldValues[field.key] || ""}
                            onChange={(e) => setFieldValues(prev => ({ ...prev, [field.key]: e.target.value }))}
                            placeholder="Enter detail..."
                            className={cn("h-11", inputHighlightClass(hasValue))}
                          />
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            </section>
          )}

          {/* Dynamic Arrays Section */}
          {clientArrayFields.length > 0 && (
            <section className="space-y-10">
              {clientArrayFields.map((field: any) => {
                const slots = (columns.filter(col => isApplicableToCol(field.entityTypes || [field.entityType], col))).length > 0 
                  ? columns.filter(col => isApplicableToCol(field.entityTypes || [field.entityType], col)) 
                  : [{ type: "individual", id: "primary", label: getTaskName(task), subLabel: "" } as ColDef]
                
                return (
                  <div key={field.key} className="space-y-4">
                    <SectionHeader icon={Users2} title={getFieldLabel(field)} colorClass="bg-slate-100 text-slate-600" />
                    {slots.map((col: ColDef) => {
                      const slotKey = `${field.key}::${col.id}`
                      const rows = arrayFieldValues[slotKey] || []
                      return (
                        <div key={slotKey} className="bg-slate-50/50 border border-slate-200 rounded-3xl overflow-hidden">
                          <div className="px-6 py-4 bg-white border-b border-slate-200 flex justify-between items-center">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-black text-slate-800">{col.label}</span>
                              <Badge variant="outline" className="text-[9px] font-bold bg-slate-50 text-slate-500">{col.subLabel}</Badge>
                            </div>
                            <Button onClick={() => addArrayRow(slotKey)} variant="outline" size="sm" className="h-8 rounded-lg font-bold text-blue-600 border-blue-200 bg-white">
                              <Plus className="h-3.5 w-3.5 mr-1" /> Add
                            </Button>
                          </div>
                          <div className="p-4 space-y-3">
                            {rows.map((row, rIdx) => (
                              <div key={row._id} className="flex flex-col sm:flex-row gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm relative group">
                                {rows.length > 1 && (
                                  <button onClick={() => removeArrayRow(slotKey, rIdx)} className="absolute -top-2 -right-2 h-6 w-6 bg-white border border-red-100 rounded-full flex items-center justify-center text-red-500 shadow-sm hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <Trash2 className="h-3 w-3" />
                                  </button>
                                )}
                                {field.arrayItems.map((item: any) => (
                                  <div key={item.variableName} className="flex-1 space-y-1.5">
                                    <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">{getFieldLabel(item)}</label>
                                    {item.options?.length ? (
                                      <SearchableSelect
                                        value={row[item.variableName] || ""}
                                        onValueChange={(v) => updateArrayFieldValue(slotKey, rIdx, item.variableName, v)}
                                        options={item.options}
                                        buttonClassName={cn("h-10", inputHighlightClass(isValidExistingValue(row[item.variableName])))}
                                      />
                                    ) : (
                                      <Input
                                        value={row[item.variableName] || ""}
                                        onChange={(e) => updateArrayFieldValue(slotKey, rIdx, item.variableName, e.target.value)}
                                        className={cn("h-10", inputHighlightClass(isValidExistingValue(row[item.variableName])))}
                                      />
                                    )}
                                  </div>
                                ))}
                              </div>
                            ))}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </section>
          )}

          {/* Questionnaire Section - Grid */}
          {questions.length > 0 && (
            <section>
              <SectionHeader icon={HelpCircle} title="Additional Questions" colorClass="bg-purple-50 text-purple-600" />
              <div className="bg-white border border-slate-100 rounded-3xl p-2 sm:p-6 shadow-sm">
                <div className="grid grid-cols-1 gap-y-2">
                  {questions.map((question: any) => {
                    const hasValue = isValidExistingValue(answers[question.id])
                    const options = (question.options || []).map((o:any) => typeof o === 'string' ? {value:o, label:o} : o)
                    return (
                      <div key={question.id} className={cn(fieldContainerClass, "md:p-6")}>
                        <label className="text-[13px] font-bold text-slate-800">
                          {question.label} {question.required && <span className="text-red-500">*</span>}
                        </label>
                        {question.description && <p className="text-[11px] text-slate-400 mb-1">{question.description}</p>}
                        {question.type === "textarea" ? (
                          <Textarea
                            value={answers[question.id] || ""}
                            onChange={(e) => setAnswers(prev => ({ ...prev, [question.id]: e.target.value }))}
                            className={cn("min-h-[100px] rounded-xl", inputHighlightClass(hasValue))}
                          />
                        ) : options.length > 0 ? (
                          <SearchableSelect
                            value={answers[question.id] || ""}
                            onValueChange={(val) => setAnswers(prev => ({ ...prev, [question.id]: val }))}
                            options={options}
                            buttonClassName={cn("h-11 rounded-xl", inputHighlightClass(hasValue))}
                          />
                        ) : (
                          <Input
                            value={answers[question.id] || ""}
                            onChange={(e) => setAnswers(prev => ({ ...prev, [question.id]: e.target.value }))}
                            className={cn("h-11 rounded-xl", inputHighlightClass(hasValue))}
                          />
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            </section>
          )}

        </div>

        {/* Action Footer */}
        <footer className="sticky bottom-0 bg-white/80 backdrop-blur-md border-t border-slate-100 px-8 py-8 flex flex-col sm:flex-row justify-between items-center gap-6 z-30">
          <div className="hidden sm:flex items-center gap-4">
             <div className="h-12 w-12 rounded-2xl bg-emerald-50 flex items-center justify-center text-emerald-600 border border-emerald-100 shadow-sm">
                <ShieldCheck className="h-6 w-6" />
             </div>
             <div>
               <p className="text-sm font-black text-slate-900">Finalize & Submit</p>
               <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">End-to-End Encryption</p>
             </div>
          </div>
          <Button
            onClick={handleSubmit}
            disabled={submitting}
            className="h-14 px-12 text-base font-black bg-slate-900 hover:bg-black text-white rounded-2xl shadow-xl w-full sm:w-auto transition-all active:scale-[0.98]"
          >
            {submitting ? <Loader2 className="h-5 w-5 mr-3 animate-spin" /> : <Check className="h-5 w-5 mr-3" />}
            {submitting ? 'Processing...' : 'Complete Submission'}
          </Button>
        </footer>

        {/* Modals */}
        {previewDocument && (
          <Dialog open={previewDialogOpen} onOpenChange={setPreviewDialogOpen}>
            <DialogContent className="max-w-[95vw] w-full max-h-[90vh] flex flex-col p-0 overflow-hidden rounded-[2rem] border-none shadow-2xl">
              <DialogHeader className="px-8 py-6 border-b border-slate-100 bg-white">
                <DialogTitle className="text-xl font-black text-slate-900 flex items-center gap-3">
                  <FileText className="h-6 w-6 text-blue-600" /> Document Preview
                </DialogTitle>
              </DialogHeader>
              <div className="flex-1 overflow-y-auto p-8 bg-slate-50">
                {previewDocument.documents.map((doc: any) => (
                  <ExtractionPreview key={doc.id} documentName={doc.name} extractedData={doc.extractedData} fields={doc.fields} fileUrl={doc.fileUrl} expanded={true} showSaveButton={false} onDialogClose={() => setPreviewDialogOpen(false)} />
                ))}
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>
    </main>
  )
}

function getFieldOptions(field: any, jobFields: Record<string, any>) {
  const mIds = field.linkedMasterFields || field.masterFieldIds || []
  if (mIds.length === 0 && field.linkedMasterFieldId) mIds.push(field.linkedMasterFieldId)
  if (mIds.length === 0) return null
  const masterField = jobFields[String(mIds[0])]
  const opts = masterField?.options
  return Array.isArray(opts) ? opts.map((o: any) => typeof o === 'string' ? { label: o, value: o } : o) : null
}

export default function ClientFillRequirementsPage() {
  return (
    <Suspense fallback={<main className="fixed inset-0 flex items-center justify-center"><Loader2 className="h-10 w-10 animate-spin text-slate-300"/></main>}>
      <ClientFillRequirementsContent />
    </Suspense>
  )
}