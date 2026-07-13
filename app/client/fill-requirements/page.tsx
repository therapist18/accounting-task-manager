// @ts-nocheck
"use client"

import React, { Suspense, useEffect, useMemo, useState, useRef } from "react"
import { useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { SearchableSelect } from "@/components/ui/searchable-select"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  FileText, Loader2, Eye, Check, X, ShieldCheck, UploadCloud, 
  AlertCircle, LayoutDashboard, Lock, Database, HelpCircle, 
  Plus, Trash2, ChevronDown, ChevronRight, Info, HelpCircle as QuestionMark,
  ArrowUpDown, ArrowUp, ArrowDown
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

// -- Modern Soft SaaS Styling --
const inputBaseClass = "rounded-lg border-slate-300 w-full focus:ring-2 focus:ring-blue-100 focus:border-blue-400 text-slate-800 text-sm h-10 px-3 shadow-sm transition-all"
const inputHighlightClass = (hasValue: boolean) => cn(
  inputBaseClass,
  hasValue ? "bg-emerald-50/40 border-emerald-200 text-emerald-900" : "bg-white"
)

const tableHeaderClass = "h-11 px-4 py-2 text-xs font-bold uppercase tracking-wider text-slate-500 bg-slate-50 border-b border-r border-slate-200 last:border-r-0 whitespace-nowrap select-none"
const tableCellClass = "px-4 py-3 text-sm text-slate-700 align-top border-b border-r border-slate-200 last:border-r-0 group-hover:bg-slate-50/50 transition-colors"

const getAcceptedTypesLabel = (docIds: string[], requiredCount: number, meta: Record<string, any>) => {
  const names = docIds.map(id => meta[id]?.display_name || meta[id]?.name || 'Document')
  if (names.length <= 1) return names[0] || 'Document'
  return requiredCount > 1 ? `Any ${requiredCount} of ${names.length}` : `Any 1 of ${names.length}`
}

const StatusIndicator = ({ isMissing, isFlagged }: { isMissing: boolean, isFlagged?: boolean }) => {
  if (isFlagged) {
    return (
      <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 gap-1.5 py-1">
        <QuestionMark className="h-3.5 w-3.5" /> Missing / Not Sure
      </Badge>
    )
  }
  if (isMissing) {
    return (
      <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 gap-1.5 py-1">
        <AlertCircle className="h-3.5 w-3.5" /> Required
      </Badge>
    )
  }
  return (
    <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 gap-1.5 py-1">
      <Check className="h-3.5 w-3.5" /> Provided
    </Badge>
  )
}

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

// Helpers to extract immigration values
function getExtractedImmigrationValue(docId: string, extractedDetails: any, meta: any) {
  if (!extractedDetails || !meta[docId]) return null;
  const fields = meta[docId].fields || [];
  // Look for field marked as isImmigrationField
  const immiField = fields.find((f: any) => f.isImmigrationField || f.is_immigration_field);
  if (immiField && extractedDetails[immiField.variableName]) {
    return { label: getFieldLabel(immiField), value: extractedDetails[immiField.variableName] };
  }
  // Fallback
  if (extractedDetails['document_number']) return { label: 'Doc Number', value: extractedDetails['document_number'] };
  if (extractedDetails['passport_number']) return { label: 'Passport No', value: extractedDetails['passport_number'] };
  return null;
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
  // Same logic as before, omitted for brevity but intact in execution...
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
  // Logic preserved
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
  const [missingDocs, setMissingDocs] = useState<Set<string>>(new Set()) // Tracks marked missing docs
  
  const [submitted, setSubmitted] = useState(false)
  const [fieldSourceDataCache, setFieldSourceDataCache] = useState<Record<string, Record<string, any>>>({})
  const [fieldMasterComputedCache, setFieldMasterComputedCache] = useState<Record<string, any>>({})
  const [existingDocsByEntity, setExistingDocsByEntity] = useState<Record<string, any[]>>({})
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({})
  
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false)
  const [previewDocument, setPreviewDocument] = useState<any>(null)
  const [expandedMultiDocs, setExpandedMultiDocs] = useState<Set<string>>(new Set())
  const prefilledRef = useRef(false)

  // Sorting States
  const [docSort, setDocSort] = useState<{key: string, dir: 'asc'|'desc'}>({ key: 'none', dir: 'asc' })

  // Hooks and API calls (Preserved exactly as original to not break functionality)
  useEffect(() => {
    // API logic preserved...
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
    // Relationship data build preserved...
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
    // Field resolution execution...
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
    // Pre-filling inputs...
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
    
    // Arrays prefilling
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
    // Existing documents retrieval...
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

  const toggleMissingReq = (slotKey: string) => {
    setMissingDocs(prev => {
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

    // Sort Logic
    if (docSort.key !== 'none') {
      rows.sort((a, b) => {
        let valA = '', valB = ''
        if (docSort.key === 'name') {
          valA = a.req.name; valB = b.req.name;
        } else if (docSort.key === 'applies') {
          valA = a.col.label; valB = b.col.label;
        }
        return docSort.dir === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA)
      })
    }
    return rows
  }, [requirements, columns, task, docSort])

  const handleDocSort = (key: string) => {
    setDocSort(prev => prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' })
  }

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
      // If user marked it as missing, we count it as "completed" action-wise so they can submit
      if (uploadedCount >= requiredCount || missingDocs.has(row.slotKey)) completed++
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
  }, [requirementRows, docFiles, existingDocsByEntity, clientFields, fieldValues, clientArrayFields, arrayFieldValues, questions, answers, columns, missingDocs])

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
      const draft = { 
        status: "submitted", 
        submitted_at: new Date().toISOString(), 
        documents, 
        questions: answers, 
        fields: fieldMetadata,
        missing_requirements: Array.from(missingDocs) // Pass to backend
      }
      const { error } = await supabase.from("tm_tasks").update({ registry_metadata: { ...(task.registry_metadata || {}), client_requirements_draft: draft }, updated_at: new Date().toISOString() }).eq("id", taskId)
      if (error) throw error
      setSubmitted(true); toast.success("Submitted successfully", { id: toastId })
    } catch { toast.error("Failed to submit", { id: toastId }) } finally { setSubmitting(false) }
  }

  // Common Header Renderer for Tables
  const SortableHeader = ({ label, sortKey, currentSort, onSort, className }: any) => {
    return (
      <div 
        className={cn("flex items-center gap-1.5 cursor-pointer hover:text-slate-800 transition-colors w-max", className)}
        onClick={() => onSort(sortKey)}
      >
        {label}
        {currentSort.key === sortKey ? (
          currentSort.dir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
        ) : (
          <ArrowUpDown className="h-3 w-3 text-slate-300" />
        )}
      </div>
    )
  }

  if (loading) {
    return (
      <main className="fixed inset-0 bg-slate-50/50 flex items-center justify-center z-[100]">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          <p className="text-sm font-semibold text-slate-600 uppercase tracking-widest">Preparing Workspace</p>
        </div>
      </main>
    )
  }

  if (!taskId || !task) {
    return (
      <main className="fixed inset-0 bg-slate-50 flex items-center justify-center p-6 z-[100]">
        <div className="bg-white p-8 rounded-2xl max-w-sm w-full text-center border border-slate-200 shadow-xl">
          <AlertCircle className="h-10 w-10 text-red-500 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-slate-900 mb-2">Link Invalid</h1>
          <p className="text-sm text-slate-500">This secure connection is invalid or has expired.</p>
        </div>
      </main>
    )
  }

  if (submitted) {
    return (
      <main className="fixed inset-0 bg-slate-50 flex items-center justify-center p-6 z-[100]">
        <div className="bg-white p-10 rounded-2xl max-w-md w-full text-center border border-slate-200 shadow-xl">
          <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Check className="h-8 w-8 text-emerald-600" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Submission Complete</h1>
          <p className="text-sm text-slate-500 leading-relaxed">Your data has been securely transmitted. You may now close this window.</p>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-slate-50 flex flex-col font-sans">
      
      {/* Top Header */}
      <header className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 z-40 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm h-auto md:h-[76px]">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-lg font-bold text-slate-900 tracking-tight">Information Request</h1>
            <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-[10px] uppercase tracking-wider font-bold">Secure</Badge>
          </div>
          <p className="text-sm font-medium text-slate-500">{getTaskName(task)}</p>
        </div>

        <div className="flex items-center gap-6">
          <div className="text-right">
            <div className="text-sm font-bold text-slate-900">{stats.percent}% Complete</div>
            <div className="text-[11px] text-slate-500 font-medium uppercase tracking-wider">{stats.completed} of {stats.total} items ready</div>
          </div>
          <div className="w-32 sm:w-48 h-2.5 bg-slate-100 rounded-full overflow-hidden shadow-inner">
            <div className="h-full bg-blue-600 rounded-full transition-all duration-500 ease-in-out" style={{ width: `${stats.percent}%` }} />
          </div>
        </div>
      </header>

      <div className="flex-1 w-full max-w-[1400px] mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-10">
        
        {/* Instruction Banner */}
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 flex items-start gap-3 shadow-sm">
          <Info className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
          <div className="text-sm text-blue-900 leading-relaxed">
            <p className="font-bold mb-1">Please verify your information.</p>
            We have pre-filled data and documents we already have on file. Please review them for accuracy and modify any incorrect fields. If you are missing a requested document, use the <strong>"Mark Missing"</strong> option in the actions menu, and our team will assist you.
          </div>
        </div>

        {/* Documents Section */}
        {requirementRows.length > 0 && (
          <section className="relative">
            {/* Sticky Section Header */}
            <div className="sticky top-[76px] z-30 bg-white/95 backdrop-blur-md border border-slate-200 shadow-sm rounded-xl px-5 py-3 mb-4 flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <FileText className="h-5 w-5 text-blue-600" />
                Required Documentation
              </h2>
            </div>
            
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <Table className="min-w-[1000px] w-full border-collapse">
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className={tableHeaderClass}>
                        <SortableHeader label="Requirement" sortKey="name" currentSort={docSort} onSort={handleDocSort} />
                      </TableHead>
                      <TableHead className={tableHeaderClass}>
                        <SortableHeader label="Applies To" sortKey="applies" currentSort={docSort} onSort={handleDocSort} />
                      </TableHead>
                      <TableHead className={tableHeaderClass}>Extracted Data</TableHead>
                      <TableHead className={tableHeaderClass}>Files</TableHead>
                      <TableHead className={tableHeaderClass}>Status</TableHead>
                      <TableHead className={cn(tableHeaderClass, "text-right pr-4")}>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
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
                      const isFlagged = missingDocs.has(slotKey)

                      // Extract value
                      const extracted = existingDoc ? getExtractedImmigrationValue(existingDoc.document_id, existingDoc.extracted_details, documentsMeta) : null;

                      return (
                        <TableRow key={slotKey} className="group transition-none border-b border-slate-100">
                          
                          {/* Requirement */}
                          <TableCell className={tableCellClass}>
                            <div className="font-semibold text-slate-900">{req.name}</div>
                            <div className="text-[10px] font-medium text-slate-500 mt-1">
                              {getAcceptedTypesLabel(docIds, requiredCount, documentsMeta)}
                            </div>
                            {isMultiDoc && (
                                <div className="mt-1">
                                  <button onClick={() => toggleMultiDoc(slotKey)} className="text-[10px] font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1">
                                    {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                                    {isExpanded ? 'Hide types' : 'View accepted types'}
                                  </button>
                                  {isExpanded && (
                                    <div className="mt-1.5 space-y-1 pl-2 border-l-2 border-blue-100">
                                      {docIds.map((id) => (
                                        <div key={id} className="text-[10px] text-slate-600">
                                          • {documentsMeta[id]?.display_name || documentsMeta[id]?.name}
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )}
                          </TableCell>
                          
                          {/* Applies To */}
                          <TableCell className={tableCellClass}>
                            <Badge variant="secondary" className="bg-slate-100 text-slate-700 border-slate-200">
                              {col.label}
                            </Badge>
                          </TableCell>

                          {/* Extracted Data */}
                          <TableCell className={cn(tableCellClass, extracted && "bg-emerald-50/20")}>
                            {extracted ? (
                              <div className="flex flex-col gap-0.5">
                                <span className="text-[10px] uppercase font-bold text-emerald-700 tracking-wider">{extracted.label}</span>
                                <span className="text-sm font-medium text-slate-900">{extracted.value}</span>
                              </div>
                            ) : (
                              <span className="text-xs text-slate-400 italic">--</span>
                            )}
                          </TableCell>

                          {/* Files */}
                          <TableCell className={tableCellClass}>
                            <div className="flex flex-col gap-2">
                              {existingDocs.length === 0 && newFiles.length === 0 && (
                                <span className="text-xs text-slate-400 italic">None</span>
                              )}
                              {existingDocs.map((d: any) => (
                                <div key={d.id} className="flex items-center gap-2 group/file bg-slate-50 border border-slate-200 rounded px-2 py-1.5 w-max">
                                  <FileText className="h-3.5 w-3.5 text-slate-400" />
                                  <span className="text-xs font-medium text-slate-700 truncate max-w-[150px]" title={d.file_name}>{d.file_name}</span>
                                  {!isReplacing && signedUrls[d.id] && (
                                    <button onClick={() => handleDocPreview(docIds, col)} className="opacity-0 group-hover/file:opacity-100 text-[10px] font-bold text-blue-600 hover:text-blue-800 transition-opacity ml-2">
                                      Preview
                                    </button>
                                  )}
                                </div>
                              ))}
                              {newFiles.map((f, i) => (
                                <div key={i} className="flex items-center gap-2 group/file bg-blue-50 border border-blue-200 rounded px-2 py-1.5 w-max">
                                  <UploadCloud className="h-3.5 w-3.5 text-blue-600" />
                                  <span className="text-xs font-medium text-blue-900 truncate max-w-[150px]" title={f.file.name}>{f.file.name}</span>
                                  <button onClick={() => setDocFiles(prev => { const next = {...prev}; next[slotKey] = next[slotKey].filter((_,idx)=>idx!==i); return next })} className="opacity-0 group-hover/file:opacity-100 text-[10px] font-bold text-red-600 hover:text-red-800 transition-opacity ml-2">
                                    Remove
                                  </button>
                                </div>
                              ))}
                            </div>
                          </TableCell>

                          {/* Status */}
                          <TableCell className={tableCellClass}>
                            <StatusIndicator isMissing={!hasData} isFlagged={isFlagged} />
                          </TableCell>

                          {/* Actions */}
                          <TableCell className={cn(tableCellClass, "text-right pr-4 align-middle")}>
                            <div className="flex flex-col items-end gap-2">
                              <div className="flex gap-2">
                                <input type="file" className="hidden" ref={el => fileInputRefs.current[slotKey] = el} onChange={(e) => {
                                  const file = e.target.files?.[0]; if (!file) return
                                  setDocFiles(prev => ({ ...prev, [slotKey]: requiredCount > 1 ? [...(prev[slotKey] || []), { file, docId: activeDocId }] : [{ file, docId: activeDocId }] }))
                                  if(missingDocs.has(slotKey)) toggleMissingReq(slotKey); // Unmark missing if uploaded
                                  e.target.value = ''
                                }}/>
                                <Button 
                                  variant="outline"
                                  size="sm"
                                  onClick={() => fileInputRefs.current[slotKey]?.click()}
                                  className={cn("h-8 rounded-lg shadow-sm border-slate-300 text-slate-700 hover:bg-slate-50", !hasData && !isFlagged && "bg-blue-600 text-white border-blue-600 hover:bg-blue-700 hover:text-white")}
                                >
                                  {hasData ? 'Replace' : 'Upload File'}
                                </Button>
                              </div>
                              <button 
                                onClick={() => toggleMissingReq(slotKey)}
                                className={cn("text-[10px] font-bold hover:underline", isFlagged ? "text-amber-600" : "text-slate-400 hover:text-slate-600")}
                              >
                                {isFlagged ? "Unmark Missing" : "Mark as Missing"}
                              </button>
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          </section>
        )}

        {/* Form Fields Section */}
        {(clientFields.length > 0 || questions.length > 0) && (
          <section className="relative">
            <div className="sticky top-[76px] z-30 bg-white/95 backdrop-blur-md border border-slate-200 shadow-sm rounded-xl px-5 py-3 mb-4 flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Database className="h-5 w-5 text-indigo-600" />
                Required Information
              </h2>
            </div>
            
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <Table className="min-w-[800px] w-full border-collapse">
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className={tableHeaderClass}>Information Requested</TableHead>
                      <TableHead className={cn(tableHeaderClass, "w-[400px]")}>Your Value</TableHead>
                      <TableHead className={tableHeaderClass}>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    
                    {/* Questions */}
                    {questions.map((question: any) => {
                      const hasValue = isValidExistingValue(answers[question.id])
                      const options = (question.options || []).map((o:any) => typeof o === 'string' ? {value:o, label:o} : o)
                      
                      return (
                        <TableRow key={`q-${question.id}`} className="group transition-none border-b border-slate-100">
                          <TableCell className={tableCellClass}>
                            <div className="font-semibold text-slate-900">{question.label} {question.required && <span className="text-red-500">*</span>}</div>
                            {question.description && <div className="text-xs text-slate-500 mt-1">{question.description}</div>}
                          </TableCell>

                          <TableCell className={cn(tableCellClass, "bg-slate-50/30")}>
                            {question.type === "textarea" ? (
                              <Textarea
                                value={answers[question.id] || ""}
                                onChange={(e) => setAnswers(prev => ({ ...prev, [question.id]: e.target.value }))}
                                className={cn("min-h-[80px]", inputHighlightClass(hasValue))}
                              />
                            ) : options.length > 0 ? (
                              <SearchableSelect
                                value={answers[question.id] || ""}
                                onValueChange={(val) => setAnswers(prev => ({ ...prev, [question.id]: val }))}
                                options={options}
                                buttonClassName={inputHighlightClass(hasValue)}
                              />
                            ) : (
                              <Input
                                value={answers[question.id] || ""}
                                onChange={(e) => setAnswers(prev => ({ ...prev, [question.id]: e.target.value }))}
                                className={inputHighlightClass(hasValue)}
                              />
                            )}
                          </TableCell>

                          <TableCell className={tableCellClass}>
                            <StatusIndicator isMissing={!hasValue} />
                          </TableCell>
                        </TableRow>
                      )
                    })}

                    {/* Regular Fields */}
                    {clientFields.map((field: any) => {
                      const hasValue = isValidExistingValue(fieldValues[field.key])
                      const entityLabel = (field.entityTypes || (field.entityType ? [field.entityType] : [])).join(", ") || "General"
                      
                      return (
                        <TableRow key={`f-${field.key}`} className="group transition-none border-b border-slate-100">
                          <TableCell className={tableCellClass}>
                            <div className="font-semibold text-slate-900">{getFieldLabel(field)}</div>
                            <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mt-1">{entityLabel}</div>
                          </TableCell>

                          <TableCell className={cn(tableCellClass, "bg-slate-50/30")}>
                            {field.options && field.options.length > 0 ? (
                              <SearchableSelect
                                value={fieldValues[field.key] || ""}
                                onValueChange={(val) => setFieldValues(prev => ({ ...prev, [field.key]: val }))}
                                options={field.options}
                                placeholder="Select value..."
                                buttonClassName={inputHighlightClass(hasValue)}
                              />
                            ) : (
                              <Input
                                value={fieldValues[field.key] || ""}
                                onChange={(e) => setFieldValues(prev => ({ ...prev, [field.key]: e.target.value }))}
                                placeholder="Enter detail..."
                                className={inputHighlightClass(hasValue)}
                              />
                            )}
                          </TableCell>

                          <TableCell className={tableCellClass}>
                            <StatusIndicator isMissing={!hasValue} />
                          </TableCell>
                        </TableRow>
                      )
                    })}

                  </TableBody>
                </Table>
              </div>
            </div>
          </section>
        )}

        {/* Array Fields Section */}
        {clientArrayFields.length > 0 && (
          <section className="relative space-y-6">
            <div className="sticky top-[76px] z-30 bg-white/95 backdrop-blur-md border border-slate-200 shadow-sm rounded-xl px-5 py-3 flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Database className="h-5 w-5 text-emerald-600" />
                List Requirements
              </h2>
            </div>

            {clientArrayFields.map((field: any) => {
              const slots = (columns.filter(col => isApplicableToCol(field.entityTypes || [field.entityType], col))).length > 0 
                ? columns.filter(col => isApplicableToCol(field.entityTypes || [field.entityType], col)) 
                : [{ type: "individual", id: "primary", label: getTaskName(task), subLabel: "" } as ColDef]

              return (
                <div key={`arr-${field.key}`} className="space-y-4">
                  <div className="px-2">
                    <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide">{getFieldLabel(field)}</h3>
                  </div>

                  {slots.map(col => {
                    const slotKey = `${field.key}::${col.id}`
                    const rows = arrayFieldValues[slotKey] || []
                    const hasData = rows.some(r => field.arrayItems.some((i: any) => isValidExistingValue(r[i.variableName])))

                    return (
                      <div key={slotKey} className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                        <div className="flex justify-between items-center px-4 py-3 bg-slate-50 border-b border-slate-200">
                          <div className="flex items-center gap-3">
                            <span className="text-sm font-bold text-slate-900">{col.label}</span>
                            {col.subLabel && <Badge variant="outline" className="bg-white">{col.subLabel}</Badge>}
                          </div>
                          <StatusIndicator isMissing={!hasData} />
                        </div>

                        <div className="overflow-x-auto">
                          <table className="w-full text-left border-collapse min-w-[600px]">
                            <thead>
                              <tr>
                                {field.arrayItems.map((item: any) => (
                                  <th key={item.variableName} className={tableHeaderClass}>
                                    {getFieldLabel(item)}
                                  </th>
                                ))}
                                <th className={cn(tableHeaderClass, "w-16")}></th>
                              </tr>
                            </thead>
                            <tbody>
                              {rows.map((row, rIdx) => (
                                <tr key={row._id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50">
                                  {field.arrayItems.map((item: any) => (
                                    <td key={item.variableName} className={tableCellClass}>
                                      {item.options?.length ? (
                                        <SearchableSelect
                                          value={row[item.variableName] || ""}
                                          onValueChange={(v) => updateArrayFieldValue(slotKey, rIdx, item.variableName, v)}
                                          options={item.options}
                                          buttonClassName={cn("h-9 text-sm", inputHighlightClass(isValidExistingValue(row[item.variableName])))}
                                        />
                                      ) : (
                                        <Input
                                          value={row[item.variableName] || ""}
                                          onChange={(e) => updateArrayFieldValue(slotKey, rIdx, item.variableName, e.target.value)}
                                          className={cn("h-9 text-sm", inputHighlightClass(isValidExistingValue(row[item.variableName])))}
                                        />
                                      )}
                                    </td>
                                  ))}
                                  <td className={cn(tableCellClass, "text-right align-middle")}>
                                    {rows.length > 1 && (
                                      <button 
                                        onClick={() => removeArrayRow(slotKey, rIdx)} 
                                        className="text-slate-400 hover:text-red-600 transition-colors p-1.5 rounded-md hover:bg-red-50"
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </button>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <div className="p-3 border-t border-slate-200 bg-slate-50/50">
                          <Button 
                            onClick={() => addArrayRow(slotKey)} 
                            variant="outline" 
                            size="sm" 
                            className="text-xs font-bold text-blue-600 border-blue-200 bg-white hover:bg-blue-50 h-8 rounded-lg"
                          >
                            <Plus className="h-3 w-3 mr-1.5" /> Add Row
                          </Button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </section>
        )}
      </div>

      {/* Footer Actions */}
      <footer className="sticky bottom-0 bg-white border-t border-slate-200 px-6 py-4 z-40 flex justify-between items-center shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
        <div className="hidden sm:flex items-center gap-3 text-slate-500 bg-slate-50 px-4 py-2 rounded-lg border border-slate-200">
          <Lock className="h-4 w-4 text-slate-400" />
          <span className="text-[11px] font-bold uppercase tracking-wider">End-to-End Encrypted</span>
        </div>
        <Button
          onClick={handleSubmit}
          disabled={submitting}
          className="h-11 px-8 text-sm font-bold bg-slate-900 hover:bg-black text-white rounded-xl shadow-md w-full sm:w-auto transition-transform active:scale-[0.98]"
        >
          {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Check className="h-4 w-4 mr-2" />}
          {submitting ? 'Processing...' : 'Complete Submission'}
        </Button>
      </footer>

      {/* Modals */}
      {previewDocument && (
        <Dialog open={previewDialogOpen} onOpenChange={setPreviewDialogOpen}>
          <DialogContent className="max-w-[90vw] w-full max-h-[90vh] flex flex-col p-0 overflow-hidden rounded-2xl border-none shadow-2xl bg-white">
            <DialogHeader className="px-6 py-4 border-b border-slate-100 bg-slate-50/80 backdrop-blur-sm">
              <DialogTitle className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Eye className="h-5 w-5 text-blue-600" /> Document Preview
              </DialogTitle>
            </DialogHeader>
            <div className="flex-1 overflow-y-auto p-6 bg-slate-50">
              {previewDocument.documents.map((doc: any) => (
                <ExtractionPreview key={doc.id} documentName={doc.name} extractedData={doc.extractedData} fields={doc.fields} fileUrl={doc.fileUrl} expanded={true} showSaveButton={false} onDialogClose={() => setPreviewDialogOpen(false)} />
              ))}
            </div>
          </DialogContent>
        </Dialog>
      )}

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
    <Suspense fallback={<main className="fixed inset-0 flex items-center justify-center bg-slate-50"><Loader2 className="h-8 w-8 animate-spin text-blue-600"/></main>}>
      <ClientFillRequirementsContent />
    </Suspense>
  )
}