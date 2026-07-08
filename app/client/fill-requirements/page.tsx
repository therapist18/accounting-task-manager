// @ts-nocheck
"use client"

import React, { Suspense, useEffect, useMemo, useState, useRef } from "react"
import { useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { SearchableSelect } from "@/components/ui/searchable-select"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  FileText, Database, HelpCircle, Loader2, Send, UploadCloud, Eye, Calendar,
  CheckCircle2, AlertCircle, Briefcase, User, UserCheck, Users2,
  HeartPulse, Zap, X, Info, FileUp, ClipboardList
} from "lucide-react"
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

function getImmigrationDateValue(docType: any, extractedDetails: any) {
  const field = (docType?.fields || []).find((f: any) => f.isImmigrationDate === true)
  if (!field) return null
  const key = field.fieldName || field.name || field.key
  if (!key) return null
  const val = extractedDetails?.[key]
  return isValidExistingValue(val) ? val : null
}

const ENTITY_TYPE_CONFIG = {
  company: { bgColor: "bg-slate-700", Icon: Briefcase, label: "Company" },
  director: { bgColor: "bg-indigo-600", Icon: UserCheck, label: "Director" },
  principal: { bgColor: "bg-blue-700", Icon: User, label: "Principal" },
  dependant: { bgColor: "bg-blue-500", Icon: Users2, label: "Dependant" },
  sponsor: { bgColor: "bg-green-600", Icon: HeartPulse, label: "Sponsor" },
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
  const [arrayFieldValues, setArrayFieldValues] = useState<Record<string, Record<string, any>>>({})
  const [docFiles, setDocFiles] = useState<Record<string, File | null>>({})
  const [submitted, setSubmitted] = useState(false)
  const [fieldSourceDataCache, setFieldSourceDataCache] = useState<Record<string, Record<string, any>>>({})
  const [fieldMasterComputedCache, setFieldMasterComputedCache] = useState<Record<string, any>>({})
  const [existingDocsByEntity, setExistingDocsByEntity] = useState<Record<string, any[]>>({})
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({})
  const prefilledRef = useRef(false)

  useEffect(() => {
    const load = async () => {
      if (!taskId) {
        setLoading(false)
        return
      }

      try {
        setLoading(true)
        const { data: taskData, error: taskError } = await supabase
          .from("tm_tasks")
          .select("*")
          .eq("id", taskId)
          .single()
        if (taskError) throw taskError
        setTask(taskData)
        setAnswers(taskData.job_specific_answers || {})

        const { data: classReqs, error: reqError } = await supabase
          .from("tm_class_requirements")
          .select("*")
        if (reqError) throw reqError

        // tm_tasks stores the job level inside `job_level` (department_id/subdepartment_id/
        // class_id/subclass_id) rather than as top-level columns, so match against that -
        // mirrors the matching logic in fetchJobWorkspaceData.ts used by the admin matrix.
        const jobLevel = taskData.job_level || {}
        const matchingRequirements = (classReqs || []).filter((req: any) => {
          const rjl = req.job_level || {}
          if (String(rjl.department_id) === String(jobLevel.department_id) &&
            String(rjl.subdepartment_id) === String(jobLevel.subdepartment_id) &&
            String(rjl.class_id || 'null') === String(jobLevel.class_id || 'null') &&
            String(rjl.subclass_id || 'null') === String(jobLevel.subclass_id || 'null')) {
            return true
          }
          if (jobLevel.subclass_id && !rjl.subclass_id &&
            String(rjl.department_id) === String(jobLevel.department_id) &&
            String(rjl.subdepartment_id) === String(jobLevel.subdepartment_id) &&
            String(rjl.class_id || 'null') === String(jobLevel.class_id || 'null')) {
            return true
          }
          if (jobLevel.class_id && !rjl.class_id &&
            String(rjl.department_id) === String(jobLevel.department_id) &&
            String(rjl.subdepartment_id) === String(jobLevel.subdepartment_id)) {
            return true
          }
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
          const { data: docs } = await supabase
            .from("acc_portal_kyc")
            .select("id, name, display_name, fields")
            .in("id", Array.from(docIds))
          setDocumentsMeta((docs || []).reduce((acc: any, doc: any) => ({ ...acc, [doc.id]: doc }), {}))
        }

        const automationIds = new Set<string>()
        allReqs.forEach((req: any) => {
          if (req.web_automation?.automationId) automationIds.add(req.web_automation.automationId)
        })
        if (automationIds.size > 0) {
          const { data: autoData, error: autoError } = await supabase
            .from("tm_automations")
            .select("id, name, webdata")
            .in("id", Array.from(automationIds))
          if (autoError) throw autoError
          setAutomations((autoData || []).reduce((acc: any, auto: any) => ({ ...acc, [auto.id]: auto }), {}))

          const linkedFieldIds = new Set<string>()
          ;(autoData || []).forEach((auto: any) => {
            ;(auto.webdata || []).forEach((field: any) => {
              ;(field.linkedMasterFields || field.masterFieldIds || []).forEach((id: any) => linkedFieldIds.add(String(id)))
              ;(field.arrayItems || []).forEach((item: any) => {
                ;(item.linkedMasterFields || item.masterFieldIds || (item.linkedMasterFieldId ? [item.linkedMasterFieldId] : [])).forEach((id: any) => linkedFieldIds.add(String(id)))
              })
            })
          })
          if (linkedFieldIds.size > 0) {
            const { data: fields } = await supabase.from('tm_job_fields').select('*').in('id', Array.from(linkedFieldIds))
            if (fields) {
              setJobFields(fields.reduce((acc: any, f: any) => ({ ...acc, [String(f.id)]: f }), {}))
            }
          }
        }
      } catch (error: any) {
        console.error("Failed to load client requirements", error)
        toast.error(error.message || "Failed to load requirements")
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [taskId])

  const columns = useMemo(() => buildParticipantColumns(task), [task])

  const clientFields = useMemo(() => {
    const rows: any[] = []
    Object.entries(automations).forEach(([autoId, auto]: [string, any]) => {
      ;(auto.webdata || []).forEach((field: any) => {
        if (field.is_client_requirement && !["document", "computed", "array"].includes(field.fieldType)) {
          const options = getFieldOptions(field, jobFields)
          rows.push({
            ...field,
            options,
            automationId: autoId,
            automationName: auto.name,
            key: `${autoId}:${field.variableName}`
          })
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
          const arrayItems = (field.arrayItems || []).map((item: any) => ({ ...item, options: getFieldOptions(item, jobFields) }))
          rows.push({
            ...field,
            arrayItems,
            automationId: autoId,
            automationName: auto.name,
            key: `${autoId}:${field.variableName}`
          })
        }
      })
    })
    return rows
  }, [automations, jobFields])

  const updateArrayFieldValue = (slotKey: string, itemVar: string, value: any) => {
    setArrayFieldValues(prev => ({ ...prev, [slotKey]: { ...(prev[slotKey] || {}), [itemVar]: value } }))
  }

  // Mirrors the relationshipData shape built in RequirementsTab/AutomationTab so
  // existing field values resolve from the same records the admin matrix reads from.
  const relationshipData = useMemo(() => {
    if (!task) return null
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
    } else if (!principal) {
      principal = { id: applicant.id || task?.individual_id, name: applicant.name, role: applicant.role }
    }
    return {
      company: { id: companyParticipant?.id || task?.company_id, name: companyParticipant?.name || task?.company_name || 'Company', type: 'company' },
      principal: principal ? { id: principal.id, name: principal.name, role: principal.role } : null,
      directors: participants
        .filter((p: any) => p.type === 'individual' && (Array.isArray(p.role) ? (p.role.includes('director') || p.role.includes('shareholder')) : (p.role === 'director' || p.role === 'shareholder')))
        .map((d: any) => ({ id: d.id, name: d.name, role: d.role })),
      dependants,
      understudy: (() => {
        const up = participants.find((p: any) => p.type === 'individual' && (Array.isArray(p.role) ? p.role.includes('understudy') : p.role === 'understudy'))
        return up ? { id: up.id, name: up.name } : null
      })(),
      sponsor: (() => {
        const sp = participants.find((p: any) => p.type === 'individual' && (Array.isArray(p.role) ? p.role.includes('sponsor') : p.role === 'sponsor'))
        return sp ? { id: sp.id, name: sp.name } : null
      })()
    }
  }, [task])

  // Pre-fetch source data so existing field values can be resolved and pre-filled.
  useEffect(() => {
    if (!task || !relationshipData || Object.keys(jobFields).length === 0 || Object.keys(automations).length === 0) return
    const loadAll = async () => {
      const mergedSource: Record<string, Record<string, any>> = {}
      const mergedComputed: Record<string, any> = {}
      const calls: Promise<void>[] = []
      Object.entries(automations).forEach(([autoId, auto]: [string, any]) => {
        if (!auto.webdata?.length) return
        calls.push(
          fetchSourceDataImpl({
            selectedAutomationId: String(autoId),
            webData: [{ automationId: String(autoId), fields: auto.webdata }],
            jobFields,
            relationshipData,
            taskId: String(task.id || ""),
            currentIndividualId: String(task.individual_id || ""),
            task
          }).then(({ sourceData: sd, masterFieldComputedValues: mc }) => {
            Object.entries(sd).forEach(([table, records]) => {
              if (!mergedSource[table]) mergedSource[table] = {}
              Object.assign(mergedSource[table], records)
            })
            if (mc) Object.assign(mergedComputed, mc)
          }).catch(err => console.error('Error resolving field source data', err))
        )
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

  // Pre-fill scalar and array fields with whatever values already exist in the source
  // records, so the client is confirming/correcting data rather than starting blank.
  useEffect(() => {
    if (prefilledRef.current) return
    if (Object.keys(fieldSourceDataCache).length === 0 && Object.keys(fieldMasterComputedCache).length === 0) return
    if (clientFields.length === 0 && clientArrayFields.length === 0) return
    prefilledRef.current = true

    const buildCtx = (automationId: string, fields: any[]) => ({
      sourceData: fieldSourceDataCache,
      jobFields,
      webData: [{ automationId, fields }],
      selectedAutomationId: automationId,
      masterFieldComputedValues: fieldMasterComputedCache,
      relationshipData,
      taskId: String(task?.id || ""),
      currentIndividualId: String(task?.individual_id || ""),
      task,
    })

    const scalarDefaults: Record<string, any> = {}
    clientFields.forEach((field: any) => {
      const ctx = buildCtx(field.automationId, [field])
      const targetEntityId = resolveTargetEntityIdImpl(field, ctx)
      if (targetEntityId == null) return
      const val = resolveVariableValueImpl(field, String(targetEntityId), ctx)
      if (isValidExistingValue(val)) scalarDefaults[field.key] = val
    })
    if (Object.keys(scalarDefaults).length > 0) {
      setFieldValues(prev => ({ ...scalarDefaults, ...prev }))
    }

    const arrayDefaults: Record<string, Record<string, any>> = {}
    clientArrayFields.forEach((field: any) => {
      const ctx = buildCtx(field.automationId, [field])
      const rows = getArrayFieldDataImpl(field, ctx) || []
      rows.forEach((row: any) => {
        const col = columns.find((c: ColDef) => String(c.id) === String(row.entityId))
        if (!col) return
        const slotKey = `${field.key}::${col.id}`
        const values: Record<string, any> = {}
        ;(field.arrayItems || []).forEach((item: any) => {
          if (isValidExistingValue(row[item.variableName])) values[item.variableName] = row[item.variableName]
        })
        if (Object.keys(values).length > 0) arrayDefaults[slotKey] = values
      })
    })
    if (Object.keys(arrayDefaults).length > 0) {
      setArrayFieldValues(prev => ({ ...arrayDefaults, ...prev }))
    }
  }, [fieldSourceDataCache, fieldMasterComputedCache, clientFields, clientArrayFields, columns, jobFields, relationshipData, task])

  // Fetch documents already on file for each participant so the client can confirm
  // them (with a preview) instead of re-uploading blind.
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
      const addDoc = (key: any, doc: any) => {
        const k = String(key)
        if (!results[k]) results[k] = []
        results[k].push(doc)
      }

      if (personIds.length > 0) {
        const { data } = await supabase.from('acc_portal_directors_documents').select('*')
          .in('director_id', personIds).in('document_id', docIdList).neq('status', 'deleted')
        ;(data || []).forEach((d: any) => addDoc(d.director_id, d))
      }
      if (companyIds.length > 0) {
        const { data } = await supabase.from('acc_portal_kyc_uploads').select('*')
          .in('company_id', companyIds).in('document_id', docIdList).neq('status', 'deleted')
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

  const getExistingDoc = (docId: string, col: ColDef) => {
    const docs = existingDocsByEntity[String(col.id)] || []
    const matches = docs.filter((d: any) => d.document_id === docId)
    if (matches.length === 0) return null
    return matches.reduce((prev: any, curr: any) => new Date(curr.created_at || 0) > new Date(prev.created_at || 0) ? curr : prev)
  }

  const handleSubmit = async () => {
    if (!task || !taskId) return
    setSubmitting(true)
    const toastId = toast.loading("Submitting requirements...")

    try {
      const documents: any[] = []

      for (const [slotKey, file] of Object.entries(docFiles)) {
        if (!file) continue
        const [docId, colId] = slotKey.split("::")
        const col = columns.find((c: ColDef) => String(c.id) === String(colId))
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_")
        const filePath = `client-requirements/${taskId}/${Date.now()}-${safeName}`
        const { error: uploadError } = await supabase.storage
          .from("kyc-documents")
          .upload(filePath, file, { upsert: true })
        if (uploadError) throw uploadError
        documents.push({
          document_id: docId,
          entity_id: col?.id ?? colId,
          entity_type: col?.type || "individual",
          entity_label: col?.label || "",
          file_name: file.name,
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
            value,
            automationId: autoId,
            automationName: auto?.name,
            variableName: varName,
            fieldType: fieldDef.fieldType,
            entityTypes: fieldDef.entityTypes || (fieldDef.entityType ? [fieldDef.entityType] : []),
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
          const rowValues = arrayFieldValues[slotKey]
          const hasData = rowValues && Object.values(rowValues).some((v: any) => v !== "" && v !== null && v !== undefined)
          if (!hasData) return
          rows.push({ ...rowValues, entityId: col.id, entityLabel: col.label })
        })
        if (rows.length > 0) {
          fieldMetadata[field.key] = {
            value: rows,
            automationId: field.automationId,
            automationName: field.automationName,
            variableName: field.variableName,
            fieldType: "array",
            entityTypes,
            arrayItems: (field.arrayItems || []).map((item: any) => ({
              variableName: item.variableName,
              name: item.efnsDisplayName || item.name || item.variableName,
              masterFieldIds: item.linkedMasterFields || item.masterFieldIds || [],
            })),
          }
        }
      })

      const draft = {
        status: "submitted",
        submitted_at: new Date().toISOString(),
        documents,
        questions: answers,
        fields: fieldMetadata,
      }

      const { error } = await supabase
        .from("tm_tasks")
        .update({
          registry_metadata: {
            ...(task.registry_metadata || {}),
            client_requirements_draft: draft
          },
          updated_at: new Date().toISOString()
        })
        .eq("id", taskId)
      if (error) throw error

      setSubmitted(true)
      toast.success("Submitted successfully", { id: toastId })
    } catch (error: any) {
      console.error("Client requirements submit failed", error)
      toast.error(error.message || "Failed to submit", { id: toastId })
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-blue-600" />
      </main>
    )
  }

  if (!taskId || !task) {
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <Card className="max-w-md w-full border-none shadow-xl">
          <CardContent className="pt-8 text-center space-y-4">
            <AlertCircle className="h-12 w-12 text-red-500 mx-auto" />
            <h1 className="text-xl font-medium text-slate-800">Link Invalid</h1>
            <p className="text-sm font-medium text-slate-500">This requirements link is invalid or no longer available.</p>
          </CardContent>
        </Card>
      </main>
    )
  }

  if (submitted) {
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <Card className="max-w-lg w-full border-none shadow-2xl rounded-2xl overflow-hidden">
          <div className="h-2 bg-green-500" />
          <CardContent className="p-12 text-center space-y-6">
            <div className="bg-green-50 p-6 rounded-3xl w-fit mx-auto border-4 border-white shadow-inner">
              <CheckCircle2 className="h-12 w-12 text-green-600" />
            </div>
            <div>
              <h1 className="text-xl font-medium text-slate-900 tracking-tight">Submission Received</h1>
              <p className="text-sm font-medium text-slate-500 mt-3 leading-relaxed">
                Thank you! Your requirements have been submitted successfully and are now being reviewed by our team.
              </p>
            </div>
            <Button variant="outline" className="rounded-full px-8 font-medium" onClick={() => window.close()}>
              Close Window
            </Button>
          </CardContent>
        </Card>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-slate-50 py-12 px-4 selection:bg-blue-100">
      <div className="mx-auto max-w-4xl space-y-8">
        {/* Header Section */}
        <div className="bg-white border rounded-2xl p-8 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 p-8 opacity-5">
            <ClipboardList className="h-32 w-32" />
          </div>
          <div className="relative z-10">
            <Badge className="mb-4 bg-blue-50 text-blue-700 border-blue-200 text-[11px] font-semibold uppercase tracking-wide px-4 py-1 rounded-full">Client Requirements</Badge>
            <h1 className="text-xl font-medium text-slate-900 tracking-tight">{getTaskName(task)}</h1>
            <p className="text-sm font-medium text-slate-400 mt-2 flex items-center gap-2">
              <Info className="h-4 w-4" />
              Please provide the following documents and information to proceed.
            </p>
          </div>
        </div>

        {/* Documents Section */}
        <section className="space-y-4">
          <div className="flex items-center gap-3 ml-2">
            <div className="p-1.5 bg-blue-50 text-blue-600 rounded-lg">
              <FileText className="h-5 w-5" />
            </div>
            <h2 className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Document Uploads</h2>
          </div>
          
          <div className="grid gap-4">
            {requirements.length > 0 ? requirements.map((req: any) => {
              const entityBadges = getEntityBadges(req.entityTypes || (req.entityType ? [req.entityType] : []))
              const docIdList = normalizeDocIds(req)
              const isMultiType = docIdList.length > 1
              return (
                <Card key={req.id || req.name} className="border-none shadow-md overflow-hidden hover:shadow-lg transition-all rounded-xl">
                  <CardHeader className="bg-white border-b pb-4">
                    <div className="flex items-center justify-between gap-4">
                      <div className="space-y-1">
                        <CardTitle className="text-lg font-medium text-slate-800">{req.name}</CardTitle>
                        {req.description && <CardDescription className="text-xs font-medium text-slate-500 leading-relaxed">{req.description}</CardDescription>}
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap justify-end">
                        {isMultiType && (
                          <Badge className="rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-white border-none bg-slate-500">
                            {docIdList.length} Document Types
                          </Badge>
                        )}
                        {entityBadges.map((cfg: any) => (
                          <Badge key={cfg.type} className={cn("rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-white border-none", cfg.bgColor)}>
                            <cfg.Icon className="h-2.5 w-2.5 mr-1" />
                            {cfg.label}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-6 bg-slate-50/50">
                    <div className="grid gap-5">
                      {docIdList.map((docId: string, docIdx: number) => {
                        const entityTypes = req.entityTypes || (req.entityType ? [req.entityType] : [])
                        const applicableCols = columns.filter((col: ColDef) => isApplicableToCol(entityTypes, col))
                        const slots = applicableCols.length > 0 ? applicableCols : [{ type: "individual", id: "primary", label: getTaskName(task), subLabel: "" } as ColDef]
                        const providedCount = slots.filter((col: ColDef) => docFiles[`${docId}::${col.id}`] || getExistingDoc(docId, col)).length
                        return (
                          <div key={docId} className={cn("space-y-2.5", isMultiType && "pl-3 border-l-2 border-slate-200")}>
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <Label className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                                {documentsMeta[docId]?.display_name || documentsMeta[docId]?.name || "Document"}
                                {isMultiType && (
                                  <span className="ml-2 text-slate-300 normal-case tracking-normal">Type {docIdx + 1} of {docIdList.length}</span>
                                )}
                              </Label>
                              <Badge variant="secondary" className={cn(
                                "text-[9px] font-semibold uppercase tracking-wide rounded-full px-2 py-0 border",
                                providedCount === slots.length ? "bg-green-50 text-green-600 border-green-200" : "bg-amber-50 text-amber-600 border-amber-200"
                              )}>
                                {providedCount}/{slots.length} Provided
                              </Badge>
                            </div>
                            <div className="grid gap-3 sm:grid-cols-2">
                              {slots.map((col: ColDef) => {
                                const slotKey = `${docId}::${col.id}`
                                const existingDoc = getExistingDoc(docId, col)
                                const immigrationDate = existingDoc ? getImmigrationDateValue(documentsMeta[docId], existingDoc.extracted_details) : null
                                const signedUrl = existingDoc ? signedUrls[String(existingDoc.id)] : null
                                const isImage = !!signedUrl && /\.(jpe?g|png|gif|webp)$/i.test(existingDoc?.file_path || '')
                                const isReplacing = !!docFiles[slotKey]
                                return (
                                  <div key={slotKey} className="bg-white border-2 border-dashed border-slate-200 rounded-xl p-5 transition-all hover:border-blue-300">
                                    <div className="flex items-center justify-between gap-2 mb-3">
                                      <p className="text-sm font-semibold text-slate-700 truncate">{col.label}</p>
                                      {col.subLabel && (
                                        <Badge variant="secondary" className="text-[9px] font-semibold uppercase tracking-wide rounded-full px-2 py-0 bg-slate-100 text-slate-500 border-slate-200 shrink-0">
                                          {col.subLabel}
                                        </Badge>
                                      )}
                                    </div>

                                    {existingDoc && !isReplacing && (
                                      <div className="flex items-start gap-3 mb-3 p-3 bg-slate-50 border border-slate-200 rounded-lg">
                                        {isImage ? (
                                          <img src={signedUrl} alt="Document preview" className="w-16 h-16 object-cover rounded-md border border-slate-200 shrink-0" />
                                        ) : (
                                          <div className="w-16 h-16 flex items-center justify-center bg-white rounded-md border border-slate-200 shrink-0">
                                            <FileText className="h-6 w-6 text-slate-400" />
                                          </div>
                                        )}
                                        <div className="min-w-0 flex-1 space-y-1.5">
                                          <p className="text-xs font-semibold text-slate-700 truncate">{existingDoc.file_name || 'Existing document on file'}</p>
                                          {immigrationDate && (
                                            <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-[10px] font-semibold">
                                              <Calendar className="h-3 w-3" /> Immigration Date: {String(immigrationDate)}
                                            </div>
                                          )}
                                          {signedUrl && (
                                            <a href={signedUrl} target="_blank" rel="noopener noreferrer" className="text-[11px] font-semibold text-blue-600 hover:underline inline-flex items-center gap-1">
                                              <Eye className="h-3 w-3" /> View full document
                                            </a>
                                          )}
                                        </div>
                                      </div>
                                    )}

                                    <div className="flex items-center gap-3 flex-wrap">
                                      {docFiles[slotKey] && (
                                        <div className="flex items-center gap-2 px-3 py-1.5 bg-green-50 text-green-700 border border-green-200 rounded-full">
                                          <CheckCircle2 className="h-4 w-4" />
                                          <span className="text-[11px] font-medium truncate max-w-[150px]">{docFiles[slotKey]?.name}</span>
                                          <button onClick={() => setDocFiles(prev => ({ ...prev, [slotKey]: null }))} className="hover:text-red-500">
                                            <X className="h-3.5 w-3.5" />
                                          </button>
                                        </div>
                                      )}

                                      <input
                                        type="file"
                                        className="hidden"
                                        ref={el => fileInputRefs.current[slotKey] = el}
                                        onChange={(e) => setDocFiles(prev => ({ ...prev, [slotKey]: e.target.files?.[0] || null }))}
                                      />
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-9 rounded-full px-4 font-medium border-slate-300 hover:border-blue-400 hover:bg-blue-50 text-slate-600 transition-all"
                                        onClick={() => fileInputRefs.current[slotKey]?.click()}
                                      >
                                        <UploadCloud className="h-4 w-4 mr-2" />
                                        {isReplacing ? 'Replace File' : existingDoc ? 'Upload a Different File' : 'Select File'}
                                      </Button>
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </CardContent>
                </Card>
              )
            }) : (
              <div className="bg-white border rounded-xl p-10 text-center text-slate-400 font-medium italic shadow-sm">
                No document uploads requested.
              </div>
            )}
          </div>
        </section>

        {/* Information Fields Section */}
        <section className="space-y-4">
          <div className="flex items-center gap-3 ml-2">
            <div className="p-1.5 bg-indigo-50 text-indigo-600 rounded-lg">
              <Database className="h-5 w-5" />
            </div>
            <h2 className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Personal Information</h2>
          </div>
          
          <Card className="border-none shadow-md overflow-hidden rounded-xl bg-white">
            <CardContent className="p-8 grid gap-6 md:grid-cols-2">
              {clientFields.length > 0 ? clientFields.map((field: any) => {
                const entityBadges = getEntityBadges(field.entityTypes || (field.entityType ? [field.entityType] : []))
                return (
                  <div key={field.key} className="space-y-3 p-5 rounded-2xl bg-slate-50/50 border border-slate-100 transition-all hover:bg-white hover:shadow-md">
                    <div className="flex items-center justify-between gap-2">
                      <Label className="text-sm font-medium text-slate-700 tracking-tight">
                        {getFieldLabel(field)}
                      </Label>
                      <div className="flex gap-1">
                        {entityBadges.map((cfg: any) => (
                          <div key={cfg.type} className={cn("p-1 rounded-md text-white shadow-sm", cfg.bgColor)}>
                            <cfg.Icon className="h-2.5 w-2.5" />
                          </div>
                        ))}
                      </div>
                    </div>

                    {field.options && field.options.length > 0 ? (
                      <SearchableSelect
                        value={fieldValues[field.key] || ""}
                        onValueChange={(val) => setFieldValues(prev => ({ ...prev, [field.key]: val }))}
                        options={field.options}
                        placeholder="Choose option..."
                        searchPlaceholder="Search options..."
                        buttonClassName="h-12 text-sm bg-white border-slate-200 rounded-xl font-medium shadow-sm"
                      />
                    ) : (
                      <Input
                        value={fieldValues[field.key] || ""}
                        onChange={(e) => setFieldValues(prev => ({ ...prev, [field.key]: e.target.value }))}
                        placeholder={`Enter ${getFieldLabel(field)}...`}
                        className="bg-white h-12 border-slate-200 rounded-xl font-medium focus:ring-blue-500 shadow-sm"
                      />
                    )}
                    {field.description && (
                      <p className="text-[10px] font-medium text-slate-400 italic flex items-center gap-1">
                        <Info className="h-3 w-3" />
                        {field.description}
                      </p>
                    )}
                  </div>
                )
              }) : <p className="text-sm text-slate-400 font-medium italic md:col-span-2 text-center py-10">No information fields requested.</p>}
            </CardContent>
          </Card>
        </section>

        {/* Array / Repeated Details Section */}
        <section className="space-y-4">
          <div className="flex items-center gap-3 ml-2">
            <div className="p-1.5 bg-teal-50 text-teal-600 rounded-lg">
              <Database className="h-5 w-5" />
            </div>
            <h2 className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Additional Details</h2>
          </div>

          <div className="grid gap-4">
            {clientArrayFields.length > 0 ? clientArrayFields.map((field: any) => {
              const entityTypes = field.entityTypes || (field.entityType ? [field.entityType] : [])
              const applicableCols = columns.filter((col: ColDef) => isApplicableToCol(entityTypes, col))
              const slots = applicableCols.length > 0 ? applicableCols : [{ type: "individual", id: "primary", label: getTaskName(task), subLabel: "" } as ColDef]
              const entityBadges = getEntityBadges(entityTypes)
              return (
                <Card key={field.key} className="border-none shadow-md overflow-hidden rounded-xl">
                  <CardHeader className="bg-white border-b pb-4">
                    <div className="flex items-center justify-between gap-4">
                      <div className="space-y-1">
                        <CardTitle className="text-lg font-medium text-slate-800">{getFieldLabel(field)}</CardTitle>
                        {field.description && <CardDescription className="text-xs font-medium text-slate-500 leading-relaxed">{field.description}</CardDescription>}
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap justify-end">
                        {entityBadges.map((cfg: any) => (
                          <Badge key={cfg.type} className={cn("rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-white border-none", cfg.bgColor)}>
                            <cfg.Icon className="h-2.5 w-2.5 mr-1" />
                            {cfg.label}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-6 bg-slate-50/50 grid gap-4">
                    {slots.map((col: ColDef) => {
                      const slotKey = `${field.key}::${col.id}`
                      return (
                        <div key={slotKey} className="bg-white border border-slate-200 rounded-xl p-5">
                          <div className="flex items-center justify-between gap-2 mb-4">
                            <p className="text-sm font-semibold text-slate-700">{col.label}</p>
                            {col.subLabel && (
                              <Badge variant="secondary" className="text-[9px] font-semibold uppercase tracking-wide rounded-full px-2 py-0 bg-slate-100 text-slate-500 border-slate-200">
                                {col.subLabel}
                              </Badge>
                            )}
                          </div>
                          <div className="grid gap-4 sm:grid-cols-2">
                            {(field.arrayItems || []).map((item: any) => (
                              <div key={item.variableName} className="space-y-1.5">
                                <Label className="text-xs font-medium text-slate-500">{getFieldLabel(item)}</Label>
                                {item.options && item.options.length > 0 ? (
                                  <SearchableSelect
                                    value={arrayFieldValues[slotKey]?.[item.variableName] || ""}
                                    onValueChange={(val) => updateArrayFieldValue(slotKey, item.variableName, val)}
                                    options={item.options}
                                    placeholder="Choose option..."
                                    searchPlaceholder="Search options..."
                                    buttonClassName="h-11 text-sm bg-white border-slate-200 rounded-lg font-medium"
                                  />
                                ) : (
                                  <Input
                                    value={arrayFieldValues[slotKey]?.[item.variableName] || ""}
                                    onChange={(e) => updateArrayFieldValue(slotKey, item.variableName, e.target.value)}
                                    placeholder={`Enter ${getFieldLabel(item)}...`}
                                    className="h-11 bg-white border-slate-200 rounded-lg font-medium focus:ring-blue-500"
                                  />
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )
                    })}
                  </CardContent>
                </Card>
              )
            }) : (
              <div className="bg-white border rounded-xl p-10 text-center text-slate-400 font-medium italic shadow-sm">
                No additional details requested.
              </div>
            )}
          </div>
        </section>

        {/* Questions Section */}
        <section className="space-y-4">
          <div className="flex items-center gap-3 ml-2">
            <div className="p-1.5 bg-purple-50 text-purple-600 rounded-lg">
              <HelpCircle className="h-5 w-5" />
            </div>
            <h2 className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Additional Questions</h2>
          </div>
          
          <Card className="border-none shadow-md overflow-hidden rounded-xl bg-white">
            <CardContent className="p-8 space-y-8">
              {questions.length > 0 ? questions.map((question: any) => (
                <div key={question.id} className="space-y-3">
                  <div className="flex flex-col gap-1">
                    <Label className="text-[12px] font-medium text-slate-800 flex items-center">
                      {question.label}
                      {question.required && <span className="text-red-500 ml-1 text-lg font-semibold">*</span>}
                    </Label>
                    {question.description && (
                      <p className="text-[11px] font-medium text-slate-400 italic">{question.description}</p>
                    )}
                  </div>
                  
                  {question.type === "textarea" ? (
                    <Textarea
                      value={answers[question.id] || ""}
                      onChange={(e) => setAnswers(prev => ({ ...prev, [question.id]: e.target.value }))}
                      placeholder="Type your answer in detail..."
                      className="bg-slate-50/30 border-slate-200 rounded-xl font-medium focus:ring-blue-500 p-4 min-h-[120px]"
                    />
                  ) : question.options && question.options.length > 0 ? (
                    <SearchableSelect
                      value={answers[question.id] || ""}
                      onValueChange={(val) => setAnswers(prev => ({ ...prev, [question.id]: val }))}
                      options={question.options.map((opt: any) => typeof opt === 'string' ? { value: opt, label: opt } : opt)}
                      placeholder="Select an answer..."
                      searchPlaceholder="Search answers..."
                      buttonClassName="h-12 bg-slate-50/30 border-slate-200 rounded-xl font-medium"
                    />
                  ) : (
                    <Input
                      value={answers[question.id] || ""}
                      onChange={(e) => setAnswers(prev => ({ ...prev, [question.id]: e.target.value }))}
                      placeholder="Type your answer..."
                      className="bg-slate-50/30 h-12 border-slate-200 rounded-xl font-medium focus:ring-blue-500 shadow-sm"
                    />
                  )}
                </div>
              )) : <p className="text-sm text-slate-400 font-medium italic text-center py-10">No questions requested.</p>}
            </CardContent>
          </Card>
        </section>

        {/* Footer Submit Button */}
        <div className="sticky bottom-8 bg-white/80 backdrop-blur-md border border-slate-200 rounded-full p-3 shadow-2xl flex justify-between items-center z-50">
          <div className="px-6">
             <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
                <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Secure Submission</span>
             </div>
          </div>
          <Button 
            onClick={handleSubmit} 
            disabled={submitting} 
            className="h-14 rounded-full px-10 text-sm font-medium uppercase tracking-wide bg-custom-blue hover:bg-blue-700 shadow-lg transition-all active:scale-95 disabled:opacity-70"
          >
            {submitting ? (
              <Loader2 className="h-5 w-5 mr-3 animate-spin" />
            ) : (
              <Send className="h-5 w-5 mr-3" />
            )}
            {submitting ? 'Submitting...' : 'Submit Requirements'}
          </Button>
        </div>
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
      <main className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-blue-600" />
      </main>
    }>
      <ClientFillRequirementsContent />
    </Suspense>
  )
}