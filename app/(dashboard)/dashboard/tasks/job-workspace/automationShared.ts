// @ts-nocheck
"use client"

// Pure helpers + automation-server calls shared by the Automation tab and the guided
// application flow, so both resolve, persist and run fields exactly the same way.

import supabase from "@/lib/supabase/client"
import { updateJsonValue, ETA_SCREENSHOT_DOCUMENT_ID } from "../utils/AutomationMappingDialog"

export interface ColDef {
  type: string
  id: number | string
  label: string
  subLabel: string
  roles?: string[]
  priority: number
}

export function humanizeVariableName(name: string): string {
  if (!name) return "Field"
  return name
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

export function getFieldLabel(field: any): string {
  return field?.efnsDisplayName || field?.name || field?.displayName || humanizeVariableName(field?.variableName) || "Field"
}

export function getFieldKey(field: any): string {
  return field?.variableName || field?.name || field?.field_name
}

export function isFieldApplicable(field: any, col: ColDef): boolean {
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

export function buildRelationshipData(task: any) {
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
}

export function deriveAutomationType(automation: any): string {
  if (automation?.automation_type) return automation.automation_type
  const url = automation?.webhook_url || ''
  const parts = url.split('/').filter(Boolean)
  const last = parts[parts.length - 1]
  if (last && !last.includes('localhost') && !last.includes('http')) return last
  const secondLast = parts[parts.length - 2]
  if (secondLast && secondLast !== 'permit' && !secondLast.includes(':')) return secondLast
  return 'class-d'
}

export function getFileUrl(filePath: string) {
  if (!filePath) return ''
  if (filePath.startsWith('http')) return filePath
  const bucketName = 'kyc-documents'
  let cleanPath = filePath
  if (cleanPath.startsWith(bucketName + '/')) cleanPath = cleanPath.substring(bucketName.length + 1)
  const fullPath = `${bucketName}/${cleanPath}`
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!supabaseUrl) return ''
  const encodedPath = encodeURIComponent(fullPath).replace(/%2F/g, '/')
  return `${supabaseUrl}/storage/v1/object/public/${encodedPath}`
}

const isBlank = (v: any) => v === null || v === undefined || v === '' || v === 'Missing'

export function cleanFormData(data: Record<string, any>): Record<string, any> {
  const cleanObject = (obj: Record<string, any>) => {
    const out: Record<string, any> = {}
    let hasMeaningfulData = false
    for (const [k, v] of Object.entries(obj)) {
      if (['entityId', 'index', 'id'].includes(k)) { out[k] = v; continue }
      if (!isBlank(v)) { out[k] = v; hasMeaningfulData = true }
    }
    return hasMeaningfulData ? out : null
  }
  const cleaned: Record<string, any> = {}
  for (const [key, value] of Object.entries(data)) {
    if (isBlank(value)) continue
    if (Array.isArray(value)) {
      const arr = value
        .map(item => (typeof item === 'object' && item !== null) ? cleanObject(item) : item)
        .filter(item => item !== null)
      if (arr.length > 0) cleaned[key] = arr
    } else if (typeof value === 'object' && value !== null) {
      const obj = cleanObject(value)
      if (obj) cleaned[key] = obj
    } else {
      cleaned[key] = value
    }
  }
  return cleaned
}

/**
 * Documents per entity id (director_id / company_id), excluding deleted rows - built
 * from the documents fetchJobWorkspaceData already loaded, so document readiness
 * needs no extra queries.
 */
export function buildDocsByEntity(documentsByIndividual: Record<string, any[]>, allCompanyDocuments: any[]): Record<string, any[]> {
  const out: Record<string, any[]> = {}
  const add = (key: any, doc: any) => {
    if (doc?.status === 'deleted') return
    ;(out[String(key)] ||= []).push(doc)
  }
  Object.entries(documentsByIndividual || {}).forEach(([id, docs]) => (docs || []).forEach(d => add(id, d)))
  ;(allCompanyDocuments || []).forEach(d => { if (d.company_id != null) add(d.company_id, d) })
  return out
}

export function latestDoc(docs: any[]) {
  if (!docs?.length) return null
  return docs.reduce((a, b) => new Date(b.created_at || 0) > new Date(a.created_at || 0) ? b : a)
}

/**
 * Which DB table/path a master field (or, lacking one, a linked job question)
 * persists to - mirrors AutomationMappingDialog's persistenceSource derivation.
 */
export function getPersistenceSource(jobFields: Record<string, any>, masterFieldId: any, questionId: any, entityCategory: string) {
  if (masterFieldId != null) {
    const mDef = jobFields[String(masterFieldId)]
    if (!mDef) return null
    return mDef.sources?.find((s: any) => s.source_type === entityCategory) || mDef.sources?.[0] || null
  }
  if (questionId != null) {
    return { table: 'tm_tasks', path: `job_specific_answers ->> '${questionId}'`, linking_variable: 'id' }
  }
  return null
}

/** Writes one value into its source record and returns the updated row. */
export async function persistFieldValue({ persistenceSource, entityId, value, cachedRecord, actorId }: {
  persistenceSource: { table: string; path: string; linking_variable?: string }
  entityId: string
  value: any
  cachedRecord?: any
  actorId?: string | null
}) {
  const { table, path, linking_variable } = persistenceSource
  let record = cachedRecord
  if (!record) {
    let query = supabase.from(table).select('*')
    if (table === 'tm_tasks') query = query.eq('id', entityId)
    else if (linking_variable) query = query.eq(linking_variable, entityId)
    else query = query.or(`id.eq.${entityId},director_id.eq.${entityId},company_id.eq.${entityId}`)
    const { data, error } = await query.maybeSingle()
    if (error) throw error
    if (!data) throw new Error(`Record not found in ${table} for ${entityId}`)
    record = data
  }
  const queryField = table === 'tm_tasks' ? 'id' : linking_variable ? linking_variable : record.director_id ? 'director_id' : record.company_id ? 'company_id' : 'id'
  const recordPK = table === 'tm_tasks' ? record.id : linking_variable ? entityId : (record.director_id || record.company_id || record.id)
  const updated = updateJsonValue(record, path, value)
  const { data: updatedRecord, error: updateError } = await supabase
    .from(table)
    .update({ ...updated, updated_at: new Date().toISOString(), updated_by_id: actorId ?? null })
    .eq(queryField, recordPK)
    .select()
    .single()
  if (updateError) throw updateError
  return updatedRecord
}

// --- Automation server calls (all go through the Next API routes) ---

export async function startAutomationRun(body: { type: string; taskId: any; automationId: any; taskLabel: string | null; formData: Record<string, any> }) {
  const response = await fetch('/api/automations/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const started = await response.json().catch(() => null)
  if (!response.ok || !started?.success) throw new Error(started?.error || 'Could not start the automation.')
  return started as { jobId: string; runId: string }
}

/** Returns { status: http status, job, error } - a 503 means the service is gone, a 404 that the job is unknown. */
export async function fetchAutomationProgress(jobId: string) {
  const response = await fetch(`/api/automations/progress?jobId=${encodeURIComponent(jobId)}`, { cache: 'no-store' })
  const payload = await response.json().catch(() => null)
  return { ok: response.ok, status: response.status, job: payload?.job || null, error: payload?.error || null }
}

export async function stopAutomationRun(jobId: string) {
  const response = await fetch('/api/automations/stop', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jobId }),
  })
  const payload = await response.json().catch(() => null)
  if (!response.ok) throw new Error(payload?.error || 'Unknown error')
}

/** Stores a run's confirmation screenshot as the applicant's ETA screenshot document. */
export async function saveEvidenceScreenshot(blob: Blob, directorId: string, taskId: any, actorId?: string | null) {
  const timestamp = Date.now()
  const fileName = `eta - kenya - confirmation - ${timestamp}.png`
  const storagePath = `individual - documents / ${directorId} /${ETA_SCREENSHOT_DOCUMENT_ID}/${fileName}`
  const { error: uploadError } = await supabase.storage
    .from('kyc-documents')
    .upload(storagePath, blob, { contentType: 'image/png', upsert: false })
  if (uploadError) throw new Error(`Storage upload failed: ${uploadError.message}`)
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
        task_id: taskId,
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      // Plain scanner_users.id, matching bcl-registry's document-manager pages.
      uploaded_by: actorId ?? null,
    })
    .select()
    .single()
  if (insertError) throw new Error(`DB insert failed: ${insertError.message}`)
  return docRecord
}
