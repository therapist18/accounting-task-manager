// @ts-nocheck
"use client"

import React, { Suspense, useEffect, useMemo, useState, useRef } from "react"
import { useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { SearchableSelect } from "@/components/ui/searchable-select"
import { Badge } from "@/components/ui/badge"
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table"
import { Progress } from "@/components/ui/progress"
import {
  FileText, Loader2, Eye, Check, X, CheckCircle2, ShieldCheck, UploadCloud, 
  AlertCircle, Briefcase, User, UserCheck, Users2, HeartPulse, LayoutDashboard,
  Lock, Database, HelpCircle, Plus, Trash2,
  FileCheck2, ChevronDown, ChevronRight, Calendar, Info
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

const getTaskName = (task: any) => {
  if (task?.applicant_details?.name) return task.applicant_details.name
  const principal = task?.participants_details?.find((p: any) => p.type === "individual" && (Array.isArray(p.role) ? p.role.includes("principal") : p.role === "principal"))
  return principal?.name || task?.title || "Client"
}

const normalizeDocIds = (req: any) => req?.document_ids || (req?.document_id ? [req.document_id] : [])

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

function isValidExistingValue(val: any): boolean {
  return val !== null && val !== undefined && val !== "" && val !== "Missing"
}

// Colorful Badges from original preferred design
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

// Generates an ID for dynamic array rows
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
  
  // MODIFIED: arrayFieldValues maps slotKey to an Array of Objects representing multiple rows
  const [arrayFieldValues, setArrayFieldValues] = useState<Record<string, Array<Record<string, any>>>>({})
  
  const [docFiles, setDocFiles] = useState<Record<string, { file: File, docId: string } | null>>({})
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

  // Data Loading Effects (Unchanged)
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

    // Array Initialization mapped to handle multiple rows correctly
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

      // Ensure every slot has at least one empty row to type into
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

  const getExistingDocForReq = (docIds: string[], col: ColDef) => {
    const docs = existingDocsByEntity[String(col.id)] || []
    const matches = docs.filter((d: any) => docIds.includes(d.document_id))
    if (matches.length === 0) return null
    return matches.reduce((prev: any, curr: any) => new Date(curr.created_at || 0) > new Date(prev.created_at || 0) ? curr : prev)
  }

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
        return {
          id: doc.id,
          fileUrl: signData?.signedUrl,
          extractedData: doc.extracted_details || {},
          fields,
          name: documentsMeta[doc.document_id]?.display_name || documentsMeta[doc.document_id]?.name || 'Document',
          originalDoc: doc
        }
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
    requirementRows.forEach(({ req, docIds, col, slotKey }) => {
      const existing = getExistingDocForReq(docIds, col)
      if (existing && existing.document_id && nextSelected[slotKey] !== existing.document_id) {
        nextSelected[slotKey] = existing.document_id
        changed = true
      }
    })
    if (changed) setSelectedReqDocs(nextSelected)
  }, [requirementRows, existingDocsByEntity])

  // --- Dynamic Array Updaters ---
  const updateArrayFieldValue = (slotKey: string, rowIndex: number, itemVar: string, value: any) => {
    setArrayFieldValues(prev => {
      const next = { ...prev }
      const rows = [...(next[slotKey] || [])]
      if (rows[rowIndex]) rows[rowIndex] = { ...rows[rowIndex], [itemVar]: value }
      next[slotKey] = rows
      return next
    })
  }
  const addArrayRow = (slotKey: string) => {
    setArrayFieldValues(prev => ({
      ...prev,
      [slotKey]: [...(prev[slotKey] || []), { _id: generateId() }]
    }))
  }
  const removeArrayRow = (slotKey: string, rowIndex: number) => {
    setArrayFieldValues(prev => {
      const next = { ...prev }
      const rows = [...(next[slotKey] || [])]
      rows.splice(rowIndex, 1)
      next[slotKey] = rows
      return next
    })
  }

  // Highlight styling matching the requested colorful/glowing input themes
  const inputHighlightClass = (hasValue: boolean) => cn(
    "rounded-xl font-medium transition-all duration-200 border w-full",
    hasValue 
      ? "bg-emerald-50/60 border-emerald-300 text-emerald-900 shadow-sm" 
      : "bg-white border-slate-200 shadow-sm"
  )

  const stats = useMemo(() => {
    let total = 0
    let completed = 0

    total += requirementRows.length
    requirementRows.forEach(row => { if (docFiles[row.slotKey] || getExistingDocForReq(row.docIds, row.col)) completed++ })

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
        // Consider slot complete if ANY item in ANY row is filled.
        const hasData = rowValuesArr.some(rowValues => 
           (f.arrayItems || []).some((item:any) => isValidExistingValue(rowValues[item.variableName]))
        )
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

      for (const [slotKey, data] of Object.entries(docFiles)) {
        if (!data?.file || !data?.docId) continue
        const [reqId, colId] = slotKey.split("::")
        const col = columns.find((c: ColDef) => String(c.id) === String(colId))
        const safeName = data.file.name.replace(/[^a-zA-Z0-9._-]/g, "_")
        const filePath = `client-requirements/${taskId}/${Date.now()}-${safeName}`
        
        const { error: uploadError } = await supabase.storage.from("kyc-documents").upload(filePath, data.file, { upsert: true })
        if (uploadError) throw uploadError
        
        documents.push({
          document_id: data.docId,
          entity_id: col?.id ?? colId,
          entity_type: col?.type || "individual",
          entity_label: col?.label || "",
          file_name: data.file.name,
          file_path: filePath,
          status: "submitted",
          submitted_at: new Date().toISOString()
        })
      }

      const fieldMetadata: Record<string, any> = {}
      Object.entries(fieldValues).forEach(([key, value]) => {
        const parts = key.split(':')
        const autoId = parts[0]
        const varName = parts.slice(1).join(':')
        const auto = automations[autoId]
        const fieldDef = auto?.webdata?.find((f: any) => f.variableName === varName)
        if (fieldDef) {
          fieldMetadata[key] = {
            value, automationId: autoId, automationName: auto?.name, variableName: varName,
            fieldType: fieldDef.fieldType, entityTypes: fieldDef.entityTypes || (fieldDef.entityType ? [fieldDef.entityType] : []),
            masterFieldIds: fieldDef.linkedMasterFields || fieldDef.masterFieldIds || [],
          }
        }
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
            const hasData = (field.arrayItems || []).some((item:any) => isValidExistingValue(rowValues[item.variableName]))
            if (hasData) {
              const cleanRow = { ...rowValues, entityId: col.id, entityLabel: col.label }
              delete cleanRow._id
              rows.push(cleanRow)
            }
          })
        })
        if (rows.length > 0) {
          fieldMetadata[field.key] = {
            value: rows, automationId: field.automationId, automationName: field.automationName,
            variableName: field.variableName, fieldType: "array", entityTypes,
            arrayItems: (field.arrayItems || []).map((item: any) => ({ variableName: item.variableName, name: item.efnsDisplayName || item.name || item.variableName, masterFieldIds: item.linkedMasterFields || item.masterFieldIds || [] })),
          }
        }
      })

      const draft = { status: "submitted", submitted_at: new Date().toISOString(), documents, questions: answers, fields: fieldMetadata }

      const { error } = await supabase.from("tm_tasks").update({
        registry_metadata: { ...(task.registry_metadata || {}), client_requirements_draft: draft },
        updated_at: new Date().toISOString()
      }).eq("id", taskId)
      
      if (error) throw error

      setSubmitted(true)
      toast.success("Submitted successfully", { id: toastId })
    } catch (error: any) {
      toast.error("Failed to submit", { id: toastId })
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <main className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-[100]">
        <Loader2 className="h-10 w-10 animate-spin text-white" />
      </main>
    )
  }

  if (!taskId || !task) {
    return (
      <main className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-6 z-[100]">
        <div className="bg-white rounded-3xl shadow-2xl p-10 max-w-sm w-full text-center">
          <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Link Invalid</h1>
          <p className="text-slate-500 font-medium">This secure link is invalid or has expired.</p>
        </div>
      </main>
    )
  }

  if (submitted) {
    return (
      <main className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-6 z-[100]">
        <div className="bg-white rounded-3xl shadow-2xl p-12 max-w-md w-full text-center space-y-5">
          <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-2 border-8 border-white shadow-inner">
            <CheckCircle2 className="h-10 w-10 text-emerald-600" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Successfully Submitted</h1>
          <p className="text-slate-500 font-medium leading-relaxed">
            Your information has been securely transmitted and is now being reviewed by our team.
          </p>
        </div>
      </main>
    )
  }

  return (
    <main className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-0 sm:p-4 md:p-6 z-[100]">
      {/* Dialog / Modal Wrapper */}
      <div className="bg-slate-50 sm:rounded-[2rem] shadow-2xl w-full max-w-6xl h-full sm:h-[95vh] flex flex-col overflow-hidden relative border-0 sm:border border-slate-200">
        
        {/* Dynamic & Colorful Header Dashboard */}
        <header className="bg-white border-b border-slate-200 shrink-0 px-4 sm:px-6 md:px-8 py-4 sm:py-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 sm:gap-6 shadow-sm z-20">
          <div className="flex items-center gap-3 sm:gap-5">
            <div className="h-10 w-10 sm:h-14 sm:w-14 bg-blue-600 rounded-xl sm:rounded-2xl flex items-center justify-center text-white shadow-lg shadow-blue-200 shrink-0">
              <LayoutDashboard className="h-5 w-5 sm:h-7 sm:w-7" />
            </div>
            <div>
              <h1 className="text-lg sm:text-2xl font-bold text-slate-900 tracking-tight">Onboarding Checklist</h1>
              <div className="flex flex-wrap items-center gap-2 sm:gap-3 mt-1 sm:mt-1.5 text-slate-500">
                <Badge variant="outline" className="bg-slate-50 text-slate-700 font-semibold border-slate-200 shadow-sm text-[10px] sm:text-xs">
                  {getTaskName(task)}
                </Badge>
                <span className="text-slate-300 hidden sm:inline">•</span>
                <span className="text-[9px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1 sm:gap-1.5">
                  <Lock className="h-2.5 w-2.5 sm:h-3 sm:w-3" /> <span className="hidden xs:inline">Secure </span>Portal
                </span>
              </div>
            </div>
          </div>
          <div className="bg-slate-900 text-white rounded-xl sm:rounded-2xl p-3 sm:p-4 min-w-0 sm:min-w-[260px] shadow-lg shrink-0 border border-slate-800">
             <div className="flex justify-between items-end mb-2 sm:mb-2.5">
                <span className="text-[9px] sm:text-[10px] uppercase tracking-widest font-bold text-slate-400">Total Completion</span>
                <span className="text-lg sm:text-xl font-bold leading-none">{stats.percent}%</span>
             </div>
             <Progress value={stats.percent} className="h-1.5 sm:h-2 bg-slate-700" indicatorClassName={stats.percent === 100 ? "bg-emerald-400" : "bg-blue-400"} />
             <p className="text-[10px] sm:text-[11px] mt-2 sm:mt-2.5 text-slate-300 font-medium">
              <strong className="text-white">{stats.completed}</strong> of <strong className="text-white">{stats.total}</strong> items addressed
             </p>
          </div>
        </header>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-8 space-y-8 pb-24">
          
          {/* Documents Section */}
          {requirementRows.length > 0 && (
            <section className="space-y-3">
              <div className="flex items-center gap-3 ml-2">
                <div className="p-2 bg-blue-100 text-blue-700 rounded-xl shadow-sm"><FileText className="h-5 w-5" /></div>
                <h2 className="text-sm font-bold text-slate-800">Required Documents</h2>
                <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{requirementRows.length}</span>
              </div>

              <div className="space-y-2">
                {requirementRows.map(({ req, docIds, col, slotKey }) => {
                  const activeDocId = selectedReqDocs[slotKey] || docIds[0]
                  const existingDoc = getExistingDocForReq(docIds, col)
                  const isReplacing = !!docFiles[slotKey]
                  const hasData = isReplacing || !!existingDoc
                  const isMultiDoc = docIds.length > 1
                  const isExpanded = expandedMultiDocs.has(slotKey)

                  const handleDocTypeChange = (newDocId: string) => {
                    setSelectedReqDocs(prev => ({ ...prev, [slotKey]: newDocId }))
                    if (docFiles[slotKey]) setDocFiles(prev => { const next = {...prev}; delete next[slotKey]; return next; })
                  }

                  return (
                    <div key={slotKey} className={cn(
                      "bg-white rounded-xl border transition-all duration-200",
                      hasData ? "border-emerald-200 shadow-sm shadow-emerald-100" : "border-slate-200 hover:border-slate-300 shadow-sm"
                    )}>
                      {/* Main Row */}
                      <div className="flex items-center gap-3 p-4 sm:p-5">
                        {/* Status indicator */}
                        <div className={cn(
                          "w-2 h-2 rounded-full shrink-0",
                          hasData ? "bg-emerald-500" : "bg-amber-400"
                        )} />

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="font-bold text-slate-900 text-sm sm:text-[15px] truncate">{req.name}</p>
                              <div className="flex flex-wrap items-center gap-2 mt-1.5">
                                <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md uppercase tracking-wider">{col.label}</span>
                                {isMultiDoc && (
                                  <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md">{docIds.length} Types Available</span>
                                )}
                                {existingDoc && (
                                  <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md flex items-center gap-1">
                                    <Calendar className="h-3 w-3" />
                                    {new Date(existingDoc.created_at).toLocaleDateString('en-GB')}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Multi-doc type accordion */}
                          {isMultiDoc && (
                            <div className="mt-3">
                              <button
                                onClick={() => toggleMultiDoc(slotKey)}
                                className="flex items-center gap-2 text-xs font-semibold text-blue-600 hover:text-blue-700 transition-colors"
                              >
                                {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                                {isExpanded ? 'Hide' : 'Show'} document types
                              </button>
                              {isExpanded && (
                                <div className="mt-2 space-y-1.5 pl-5">
                                  {docIds.map((docId: string) => {
                                    const docMeta = documentsMeta[docId]
                                    const isActive = activeDocId === docId
                                    const docForEntity = existingDocsByEntity[String(col.id)]?.find((d: any) => d.document_id === docId)
                                    return (
                                      <label
                                        key={docId}
                                        className={cn(
                                          "flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer transition-all text-sm",
                                          isActive ? "border-blue-300 bg-blue-50 shadow-sm" : "border-slate-100 hover:bg-slate-50"
                                        )}
                                      >
                                        <input
                                          type="radio"
                                          name={`doc-type-${slotKey}`}
                                          checked={isActive}
                                          onChange={() => handleDocTypeChange(docId)}
                                          className="accent-blue-600"
                                        />
                                        <div className="flex-1 min-w-0">
                                          <span className="font-semibold text-slate-800 block truncate">{docMeta?.display_name || docMeta?.name || 'Document'}</span>
                                        </div>
                                        {docForEntity && (
                                          <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md shrink-0">Uploaded</span>
                                        )}
                                      </label>
                                    )
                                  })}
                                </div>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Right side: Status + Actions */}
                        <div className="flex items-center gap-2 shrink-0">
                          {hasData && existingDoc && signedUrls[String(existingDoc.id)] && (
                            <button
                              onClick={() => handleDocPreview(docIds, col)}
                              className="h-9 px-3 rounded-lg text-xs font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 border border-blue-200 transition-all flex items-center gap-1.5"
                            >
                              <Eye className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Preview</span>
                            </button>
                          )}
                          <input type="file" className="hidden" ref={el => fileInputRefs.current[slotKey] = el} onChange={(e) => {
                            if (e.target.files?.[0]) setDocFiles(prev => ({ ...prev, [slotKey]: { file: e.target.files![0], docId: activeDocId } }))
                          }}/>
                          <Button
                            variant={hasData ? "outline" : "default"}
                            size="sm"
                            className={cn("h-9 px-4 rounded-lg text-xs font-bold shadow-sm transition-all", hasData ? "text-slate-600 border-slate-300 hover:bg-slate-100" : "bg-blue-600 text-white hover:bg-blue-700 shadow-blue-200")}
                            onClick={() => fileInputRefs.current[slotKey]?.click()}
                          >
                            <UploadCloud className="h-3.5 w-3.5 mr-1.5" />
                            {hasData ? 'Replace' : 'Upload'}
                          </Button>
                        </div>
                      </div>

                      {/* Status Bar */}
                      {docFiles[slotKey] && (
                        <div className="px-5 py-2.5 bg-emerald-50 border-t border-emerald-100 flex items-center gap-2 rounded-b-xl">
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                          <span className="text-xs font-bold text-emerald-700 truncate">{docFiles[slotKey].file.name}</span>
                          <button onClick={() => setDocFiles(prev => { const next = {...prev}; delete next[slotKey]; return next; })} className="ml-auto hover:text-red-600 rounded-full p-0.5 transition-colors">
                            <X className="h-3.5 w-3.5 text-emerald-500 hover:text-red-500" />
                          </button>
                        </div>
                      )}
                      {existingDoc && !docFiles[slotKey] && (
                        <div className="px-5 py-2.5 bg-slate-50 border-t border-slate-100 flex items-center gap-2 rounded-b-xl">
                          <FileCheck2 className="h-3.5 w-3.5 text-emerald-600" />
                          <span className="text-xs font-medium text-slate-600 truncate">{existingDoc.file_name || 'Uploaded file'}</span>
                          {existingDoc.status && (
                            <span className={cn(
                              "text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ml-auto",
                              existingDoc.status === 'active' ? "text-emerald-600 bg-emerald-100" : existingDoc.status === 'draft' ? "text-amber-600 bg-amber-100" : "text-slate-500 bg-slate-100"
                            )}>{existingDoc.status}</span>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </section>
          )}

          {/* Profile Details Section */}
          {clientFields.length > 0 && (
            <section className="space-y-3">
              <div className="flex items-center gap-3 ml-2">
                <div className="p-2 bg-indigo-100 text-indigo-700 rounded-xl shadow-sm"><Database className="h-5 w-5" /></div>
                <h2 className="text-sm font-bold text-slate-800">Profile Details</h2>
                <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{clientFields.length}</span>
              </div>
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                {/* Desktop Table */}
                <div className="hidden md:block overflow-x-auto">
                  <Table className="min-w-[700px]">
                    <TableHeader>
                      <TableRow className="bg-slate-50/80 hover:bg-slate-50/80 border-b">
                        <TableHead className="text-xs font-bold text-slate-500 uppercase tracking-wider py-4 px-6 w-[280px]">Field</TableHead>
                        <TableHead className="text-xs font-bold text-slate-500 uppercase tracking-wider py-4 hidden lg:table-cell w-[180px]">Related To</TableHead>
                        <TableHead className="text-xs font-bold text-slate-500 uppercase tracking-wider py-4 px-6">Value</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody className="divide-y divide-slate-100">
                      {clientFields.map((field: any) => {
                        const entityBadges = getEntityBadges(field.entityTypes || (field.entityType ? [field.entityType] : []))
                        const hasValue = isValidExistingValue(fieldValues[field.key])
                        return (
                          <TableRow key={field.key} className={cn("transition-colors", hasValue ? "bg-emerald-50/20 border-l-4 border-l-emerald-500" : "hover:bg-slate-50 border-l-4 border-l-transparent")}>
                            <TableCell className="align-top py-5 px-6">
                              <p className="font-bold text-slate-900 text-[15px]">{getFieldLabel(field)}</p>
                              {field.description && <p className="text-xs font-medium text-slate-500 mt-1">{field.description}</p>}
                            </TableCell>
                            <TableCell className="align-top py-5 hidden lg:table-cell">
                              <div className="flex flex-col gap-1.5">
                                {entityBadges.map((cfg: any) => (
                                  <Badge key={cfg.type} variant="secondary" className="w-fit bg-slate-100 text-slate-700 border-slate-200 shadow-sm rounded-md px-2 py-1 text-[10px] font-bold uppercase tracking-wider">
                                    <cfg.Icon className="h-3 w-3 mr-1.5 text-slate-500" /> {cfg.label}
                                  </Badge>
                                ))}
                              </div>
                            </TableCell>
                            <TableCell className="align-top py-4 px-6 min-w-[260px]">
                              {field.options && field.options.length > 0 ? (
                                <SearchableSelect
                                  value={fieldValues[field.key] || ""}
                                  onValueChange={(val) => setFieldValues(prev => ({ ...prev, [field.key]: val }))}
                                  options={field.options}
                                  placeholder="Select option..."
                                  buttonClassName={cn("h-11 text-sm", inputHighlightClass(hasValue))}
                                />
                              ) : (
                                <Input
                                  value={fieldValues[field.key] || ""}
                                  onChange={(e) => setFieldValues(prev => ({ ...prev, [field.key]: e.target.value }))}
                                  placeholder="Enter details..."
                                  className={cn("h-11 text-sm", inputHighlightClass(hasValue))}
                                />
                              )}
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
                {/* Mobile Cards */}
                <div className="md:hidden divide-y divide-slate-100">
                  {clientFields.map((field: any) => {
                    const entityBadges = getEntityBadges(field.entityTypes || (field.entityType ? [field.entityType] : []))
                    const hasValue = isValidExistingValue(fieldValues[field.key])
                    return (
                      <div key={field.key} className={cn("p-4 transition-colors", hasValue && "bg-emerald-50/30")}>
                        <div className="flex items-center justify-between mb-3">
                          <p className="font-bold text-slate-900 text-sm">{getFieldLabel(field)}</p>
                          <div className="flex gap-1">
                            {entityBadges.map((cfg: any) => (
                              <Badge key={cfg.type} className={cn("rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase text-white shadow-sm border-none", cfg.bgColor)}>
                                <cfg.Icon className="h-3 w-3" />
                              </Badge>
                            ))}
                          </div>
                        </div>
                        {field.description && <p className="text-xs font-medium text-slate-500 mb-3">{field.description}</p>}
                        {field.options && field.options.length > 0 ? (
                          <SearchableSelect
                            value={fieldValues[field.key] || ""}
                            onValueChange={(val) => setFieldValues(prev => ({ ...prev, [field.key]: val }))}
                            options={field.options}
                            placeholder="Select option..."
                            buttonClassName={cn("h-11 text-sm w-full", inputHighlightClass(hasValue))}
                          />
                        ) : (
                          <Input
                            value={fieldValues[field.key] || ""}
                            onChange={(e) => setFieldValues(prev => ({ ...prev, [field.key]: e.target.value }))}
                            placeholder="Enter details..."
                            className={cn("h-11 text-sm", inputHighlightClass(hasValue))}
                          />
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            </section>
          )}

          {/* Dynamic Array Details Section (Multiple Rows per slot) */}
          {clientArrayFields.length > 0 && (
            <section className="space-y-6">
              {clientArrayFields.map((field: any) => {
                const entityTypes = field.entityTypes || (field.entityType ? [field.entityType] : [])
                const applicableCols = columns.filter((col: ColDef) => isApplicableToCol(entityTypes, col))
                const slots = applicableCols.length > 0 ? applicableCols : [{ type: "individual", id: "primary", label: getTaskName(task), subLabel: "" } as ColDef]
                const colSpan = (field.arrayItems || []).length + 2

                return (
                  <div key={field.key} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="px-6 py-5 border-b border-slate-200 bg-slate-50/70">
                      <h2 className="text-base font-bold text-slate-900">{getFieldLabel(field)}</h2>
                      {field.description && <p className="text-sm font-medium text-slate-500 mt-1">{field.description}</p>}
                    </div>
                    <div className="overflow-x-auto w-full">
                      <Table className="min-w-[700px]">
                        <TableHeader>
                          <TableRow className="bg-white border-b-2 border-slate-100">
                            <TableHead className="text-xs font-bold text-slate-400 uppercase tracking-wider py-4 px-6 w-16 text-center">#</TableHead>
                            {(field.arrayItems || []).map((item: any) => (
                              <TableHead key={item.variableName} className="text-xs font-bold text-slate-500 uppercase tracking-wider py-4 px-4 min-w-[200px]">
                                {getFieldLabel(item)}
                              </TableHead>
                            ))}
                            <TableHead className="w-16"></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody className="divide-y divide-slate-100">
                          {slots.map((col: ColDef) => {
                            const slotKey = `${field.key}::${col.id}`
                            const rows = arrayFieldValues[slotKey] || []
                            return (
                              <React.Fragment key={slotKey}>
                                {/* Entity Group Header */}
                                <TableRow className="bg-slate-50/40">
                                  <TableCell colSpan={colSpan} className="py-2.5 px-6 border-b border-slate-100">
                                    <div className="flex items-center justify-between">
                                      <div className="flex items-center gap-2">
                                        <Users2 className="h-4 w-4 text-slate-400" />
                                        <span className="text-sm font-bold text-slate-700">{col.label}</span>
                                        {col.subLabel && <span className="text-[10px] uppercase font-bold text-slate-400 bg-white border px-1.5 py-0.5 rounded shadow-sm">{col.subLabel}</span>}
                                      </div>
                                      <Button onClick={() => addArrayRow(slotKey)} variant="outline" size="sm" className="h-7 text-[10px] font-bold bg-white text-blue-600 border-blue-200 hover:bg-blue-50">
                                        <Plus className="h-3 w-3 mr-1" /> Add Record
                                      </Button>
                                    </div>
                                  </TableCell>
                                </TableRow>

                                {/* Rows */}
                                {rows.map((rowValues, rIdx) => {
                                  const hasRowData = (field.arrayItems || []).some((item:any) => isValidExistingValue(rowValues[item.variableName]))
                                  return (
                                    <TableRow key={rowValues._id} className={cn("transition-colors", hasRowData ? "bg-emerald-50/10" : "hover:bg-slate-50/30")}>
                                      <TableCell className="text-center py-4 text-xs font-bold text-slate-400">{rIdx + 1}</TableCell>
                                      {(field.arrayItems || []).map((item: any) => {
                                        const val = rowValues[item.variableName] || ""
                                        const hasVal = isValidExistingValue(val)
                                        return (
                                          <TableCell key={item.variableName} className="align-middle py-3 px-4">
                                            {item.options && item.options.length > 0 ? (
                                              <SearchableSelect
                                                value={val}
                                                onValueChange={(v) => updateArrayFieldValue(slotKey, rIdx, item.variableName, v)}
                                                options={item.options}
                                                placeholder="Select..."
                                                buttonClassName={cn("h-10 text-sm", inputHighlightClass(hasVal))}
                                              />
                                            ) : (
                                              <Input
                                                value={val}
                                                onChange={(e) => updateArrayFieldValue(slotKey, rIdx, item.variableName, e.target.value)}
                                                placeholder={`Enter ${getFieldLabel(item)}`}
                                                className={cn("h-10 text-sm", inputHighlightClass(hasVal))}
                                              />
                                            )}
                                          </TableCell>
                                        )
                                      })}
                                      <TableCell className="text-center py-4">
                                        {rows.length > 1 && (
                                          <Button onClick={() => removeArrayRow(slotKey, rIdx)} variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-full">
                                            <Trash2 className="h-4 w-4" />
                                          </Button>
                                        )}
                                      </TableCell>
                                    </TableRow>
                                  )
                                })}
                              </React.Fragment>
                            )
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )
              })}
            </section>
          )}

          {/* Questionnaire Section */}
          {questions.length > 0 && (
            <section className="space-y-3">
              <div className="flex items-center gap-3 ml-2">
                <div className="p-2 bg-purple-100 text-purple-700 rounded-xl shadow-sm"><HelpCircle className="h-5 w-5" /></div>
                <h2 className="text-sm font-bold text-slate-800">Additional Questions</h2>
                <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{questions.length}</span>
              </div>
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                {/* Desktop Table */}
                <div className="hidden md:block overflow-x-auto">
                  <Table className="min-w-[700px]">
                    <TableHeader>
                      <TableRow className="bg-slate-50/80 hover:bg-slate-50/80 border-b">
                        <TableHead className="text-xs font-bold text-slate-500 uppercase tracking-wider py-4 px-6 w-[40%]">Question</TableHead>
                        <TableHead className="text-xs font-bold text-slate-500 uppercase tracking-wider py-4 px-6 w-[60%]">Answer</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody className="divide-y divide-slate-100">
                      {questions.map((question: any) => {
                        const hasValue = isValidExistingValue(answers[question.id])
                        const questionOptions = (question.options || []).map((opt: any) => typeof opt === 'string' ? { value: opt, label: opt } : opt)
                        return (
                          <TableRow key={question.id} className={cn("transition-colors", hasValue ? "bg-emerald-50/20 border-l-4 border-l-emerald-500" : "hover:bg-slate-50 border-l-4 border-l-transparent")}>
                            <TableCell className="align-top py-5 px-6">
                              <p className="font-bold text-slate-900 text-[15px]">
                                {question.label}
                                {question.required && <span className="text-rose-500 ml-1">*</span>}
                              </p>
                              {question.description && <p className="text-xs font-medium text-slate-500 mt-1.5">{question.description}</p>}
                            </TableCell>
                            <TableCell className="align-top py-5 px-6">
                              {question.type === "textarea" ? (
                                <Textarea
                                  value={answers[question.id] || ""}
                                  onChange={(e) => setAnswers(prev => ({ ...prev, [question.id]: e.target.value }))}
                                  placeholder="Provide details..."
                                  className={cn("min-h-[100px] p-4 text-sm resize-y", inputHighlightClass(hasValue))}
                                />
                              ) : questionOptions.length > 0 ? (
                                <SearchableSelect
                                  value={answers[question.id] || ""}
                                  onValueChange={(val) => setAnswers(prev => ({ ...prev, [question.id]: val }))}
                                  options={questionOptions}
                                  placeholder="Select an option..."
                                  buttonClassName={cn("h-11 text-sm", inputHighlightClass(hasValue))}
                                />
                              ) : (
                                <Input
                                  value={answers[question.id] || ""}
                                  onChange={(e) => setAnswers(prev => ({ ...prev, [question.id]: e.target.value }))}
                                  placeholder="Type answer..."
                                  className={cn("h-11 text-sm", inputHighlightClass(hasValue))}
                                />
                              )}
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
                {/* Mobile Cards */}
                <div className="md:hidden divide-y divide-slate-100">
                  {questions.map((question: any) => {
                    const hasValue = isValidExistingValue(answers[question.id])
                    const questionOptions = (question.options || []).map((opt: any) => typeof opt === 'string' ? { value: opt, label: opt } : opt)
                    return (
                      <div key={question.id} className={cn("p-4 transition-colors", hasValue && "bg-emerald-50/30")}>
                        <p className="font-bold text-slate-900 text-sm mb-3">
                          {question.label}
                          {question.required && <span className="text-rose-500 ml-1">*</span>}
                        </p>
                        {question.description && <p className="text-xs font-medium text-slate-500 mb-3">{question.description}</p>}
                        {question.type === "textarea" ? (
                          <Textarea
                            value={answers[question.id] || ""}
                            onChange={(e) => setAnswers(prev => ({ ...prev, [question.id]: e.target.value }))}
                            placeholder="Provide details..."
                            className={cn("min-h-[80px] p-3 text-sm resize-y", inputHighlightClass(hasValue))}
                          />
                        ) : questionOptions.length > 0 ? (
                          <SearchableSelect
                            value={answers[question.id] || ""}
                            onValueChange={(val) => setAnswers(prev => ({ ...prev, [question.id]: val }))}
                            options={questionOptions}
                            placeholder="Select an option..."
                            buttonClassName={cn("h-11 text-sm w-full", inputHighlightClass(hasValue))}
                          />
                        ) : (
                          <Input
                            value={answers[question.id] || ""}
                            onChange={(e) => setAnswers(prev => ({ ...prev, [question.id]: e.target.value }))}
                            placeholder="Type answer..."
                            className={cn("h-11 text-sm", inputHighlightClass(hasValue))}
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

        {/* Document Preview Dialog */}
        {previewDocument && (
          <Dialog open={previewDialogOpen} onOpenChange={setPreviewDialogOpen}>
            <DialogContent className="max-w-[95vw] w-full max-h-[90vh] flex flex-col p-0 overflow-hidden rounded-2xl">
              <DialogHeader className="px-6 py-4 border-b border-slate-200 bg-white shrink-0">
                <DialogTitle className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <FileText className="h-5 w-5 text-blue-600" />
                  Document Preview
                </DialogTitle>
              </DialogHeader>
              <div className="flex-1 overflow-y-auto p-6 bg-slate-50">
                {previewDocument.documents.map((doc: any) => (
                  <ExtractionPreview
                    key={doc.id}
                    documentName={doc.name}
                    extractedData={doc.extractedData}
                    fields={doc.fields}
                    fileUrl={doc.fileUrl}
                    expanded={true}
                    showSaveButton={false}
                    onDialogClose={() => setPreviewDialogOpen(false)}
                  />
                ))}
              </div>
            </DialogContent>
          </Dialog>
        )}

        {/* Sticky Action Footer */}
        <footer className="sticky bottom-0 bg-white border-t border-slate-200 shrink-0 px-6 sm:px-8 py-5 flex justify-between items-center z-30 shadow-[0_-10px_20px_-10px_rgba(0,0,0,0.05)]">
          <div className="hidden sm:flex items-center gap-3">
             <div className="h-10 w-10 rounded-full bg-blue-50 flex items-center justify-center text-blue-600">
                <ShieldCheck className="h-5 w-5" />
             </div>
             <div>
               <p className="text-sm font-bold text-slate-800">Ready to complete?</p>
               <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">AES-256 Encryption Active</p>
             </div>
          </div>
          <Button
            onClick={handleSubmit}
            disabled={submitting}
            className="h-12 px-10 text-base font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-lg shadow-blue-200 w-full sm:w-auto transition-all active:scale-95"
          >
            {submitting ? (
              <Loader2 className="h-5 w-5 mr-2.5 animate-spin" />
            ) : <Check className="h-5 w-5 mr-2.5" />}
            {submitting ? 'Submitting securely...' : 'Submit All Requirements'}
          </Button>
        </footer>
        
      </div>
    </main>
  )
}

function getFieldOptions(field: any, jobFields: Record<string, any>) {
  const mIds = field.linkedMasterFields || field.masterFieldIds || []
  if (mIds.length === 0 && field.linkedMasterFieldId) mIds.push(field.linkedMasterFieldId)
  if (mIds.length === 0) return null
  const firstMasterId = String(mIds[0])
  const masterField = jobFields[firstMasterId]
  const opts = masterField?.options
  if (Array.isArray(opts)) {
    return opts.map((o: any) => typeof o === 'string' ? { label: o, value: o } : o)
  }
  return null
}

export default function ClientFillRequirementsPage() {
  return (
    <Suspense fallback={
      <main className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-[100]">
        <Loader2 className="h-10 w-10 animate-spin text-white" />
      </main>
    }>
      <ClientFillRequirementsContent />
    </Suspense>
  )
}