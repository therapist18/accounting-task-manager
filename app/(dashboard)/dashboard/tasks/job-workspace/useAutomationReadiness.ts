// @ts-nocheck
"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { resolveVariableValueImpl, resolveTargetEntityIdImpl, fetchSourceDataImpl, getArrayFieldDataImpl, type FieldResolutionContext } from "../utils/fieldResolution"
import { isValidValue, cleanFieldValue } from "../utils/AutomationMappingDialog"
import { executeComputedField } from "../utils/automationComputedFunctions"
import { fetchMasterFieldsRecord, isTemplateEligible } from "../../tasks-requirements/utils/templateGenerationData"
import type { JobWorkspaceData } from "./fetchJobWorkspaceData"
import { buildParticipantColumns } from "./tabs/RequirementsTab"
import {
  type ColDef, isFieldApplicable, getFieldLabel, getFieldKey, buildRelationshipData, buildDocsByEntity,
  latestDoc, getPersistenceSource, persistFieldValue, getFileUrl,
} from "./automationShared"

export interface DocReadinessItem {
  kind: "document" | "letter"
  key: string
  label: string
  col: ColDef
  docIds: string[]
  docId: string | null
  docMeta: any
  requirement: any | null
  doc: any | null
  satisfied: boolean
  optional: boolean
}

export interface FieldReadinessItem {
  kind: "field"
  key: string
  label: string
  /** Set for array sub-fields, e.g. "Travel history" */
  groupLabel?: string
  col: ColDef
  value: any
  satisfied: boolean
  optional: boolean
  fieldType: string
  options: { label: string; value: string }[]
  /** false = no linked DB field; an edit only applies to this session's runs */
  persistable: boolean
  masterFieldId: any
  questionId: any
  entityId: string | null
  entityCategory: "company" | "individual"
  overrideKey: string
}

export interface StepSummary { total: number; done: number; requiredMissing: number; optionalMissing: number }

type Snapshot = {
  jobFields: Record<string, any>
  sourceData: Record<string, Record<string, any>>
  computedMaster: Record<string, any>
  computedPreview: Record<string, any>
}

// One snapshot per task+automation for the whole browser session: leaving and
// re-entering guided mode (or switching steps) renders instantly from here while a
// silent revalidation runs, instead of a fresh spinner every time.
const snapshotCache = new Map<string, Snapshot>()
// Session-only values for fields with no linked DB column - they still feed the run.
const overrideCache = new Map<string, Record<string, any>>()

const optionsOf = (mDef: any) =>
  Array.isArray(mDef?.options) ? mDef.options.map((o: any) => typeof o === "string" ? { label: o, value: o } : o) : []

const summarize = (items: { satisfied: boolean; optional: boolean }[]): StepSummary => ({
  total: items.length,
  done: items.filter(i => i.satisfied).length,
  requiredMissing: items.filter(i => !i.satisfied && !i.optional).length,
  optionalMissing: items.filter(i => !i.satisfied && i.optional).length,
})

/**
 * Returns true if the job question with the given ID is currently visible
 * (i.e. its dependency condition is met, or it has no dependency).
 * Mirrors the checkVisibility logic used by EnquiryDialog / NewCompanyInquiryDialog.
 */
function checkJobQuestionVisible(
  questionId: string,
  questionsById: Record<string, any>,
  answers: Record<string, any>,
): boolean {
  const question = questionsById[questionId]
  if (!question) return true // unknown question → don't suppress
  const dep = question.depends_on
  if (!dep || !dep.id) return true
  const parentVal = answers[dep.id]
  const targetVal = dep.value
  switch (dep.operator) {
    case "equals":
      return String(parentVal) === String(targetVal)
    case "not_equals":
      return String(parentVal) !== String(targetVal)
    case "is_not_empty":
      if (Array.isArray(parentVal)) return parentVal.length > 0
      return parentVal !== undefined && parentVal !== null && parentVal !== ""
    case "is_empty":
      if (Array.isArray(parentVal)) return parentVal.length === 0
      return parentVal === undefined || parentVal === null || parentVal === ""
    default:
      return true
  }
}

async function loadSnapshot(automation: any, task: any, relationshipData: any[]): Promise<Snapshot> {
  const fields = automation.webdata || []
  const computedConfigs = fields.filter((f: any) => f.fieldType === "computed")
  const companyId = relationshipData[0]?.company?.id || task?.company_id

  // Master fields (cached session-wide) and computed fields don't depend on each
  // other - one wave. Source data needs the master field sources, so it follows.
  const [jobFields, computedPreview] = await Promise.all([
    fetchMasterFieldsRecord(),
    (async () => {
      if (!task?.individual_id || computedConfigs.length === 0) return {}
      const entries = await Promise.all(computedConfigs.map(async (config: any) => {
        try {
          const val = await executeComputedField(
            config.computedFunction, String(task.individual_id),
            config.computedDocuments || [], null, "latest", null,
            config.computed_config, companyId, config.entityTypes?.[0]
          )
          return [config.variableName, val]
        } catch {
          return [config.variableName, null]
        }
      }))
      return Object.fromEntries(entries)
    })(),
  ])

  const { sourceData, masterFieldComputedValues } = await fetchSourceDataImpl({
    selectedAutomationId: String(automation.id),
    webData: [{ automationId: String(automation.id), fields }],
    jobFields,
    relationshipData: relationshipData[0],
    taskId: String(task?.id || ""),
    currentIndividualId: String(task?.individual_id || ""),
    task,
  })

  return { jobFields, sourceData, computedMaster: masterFieldComputedValues || {}, computedPreview }
}

export function useAutomationReadiness(data: JobWorkspaceData, automation: any | null, actorId?: string | null) {
  const { task, kycDocsMap } = data
  const cacheKey = automation && task ? `${task.id}:${automation.id}` : null

  const [snapshot, setSnapshot] = useState<Snapshot | null>(() => (cacheKey && snapshotCache.get(cacheKey)) || null)
  const [overrides, setOverrides] = useState<Record<string, any>>(() => (cacheKey && overrideCache.get(cacheKey)) || {})
  const [status, setStatus] = useState<"loading" | "ready" | "error">(snapshot ? "ready" : "loading")
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const requestId = useRef(0)

  const columns = useMemo(() => buildParticipantColumns(task), [task])
  const relationshipData = useMemo(() => buildRelationshipData(task), [task])
  const docsByEntity = useMemo(() => buildDocsByEntity(data.documentsByIndividual, data.allCompanyDocuments), [data.documentsByIndividual, data.allCompanyDocuments])

  const load = useCallback(async () => {
    if (!automation || !cacheKey) return
    const id = ++requestId.current
    const cached = snapshotCache.get(cacheKey)
    if (cached) { setSnapshot(cached); setStatus("ready"); setRefreshing(true) }
    else setStatus("loading")
    try {
      const next = await loadSnapshot(automation, task, relationshipData)
      if (id !== requestId.current) return
      snapshotCache.set(cacheKey, next)
      setSnapshot(next)
      setStatus("ready")
      setError(null)
    } catch (err: any) {
      if (id !== requestId.current) return
      console.error("[useAutomationReadiness] load failed", err)
      setError(err?.message || "Could not load application data")
      // Keep showing cached data if there is any - a failed background refresh shouldn't blank the page.
      if (!cached) setStatus("error")
    } finally {
      if (id === requestId.current) setRefreshing(false)
    }
  }, [automation, cacheKey, task, relationshipData])

  // Re-runs whenever the workspace data object changes (an upload or a generated
  // letter triggers onRefresh) - OCR'd documents can fill fields, so values revalidate.
  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!cacheKey) return
    setOverrides(overrideCache.get(cacheKey) || {})
  }, [cacheKey])

  const ctxFor = useCallback((field: any, currentIndividualId: string, sourceOverride?: Record<string, Record<string, any>>): FieldResolutionContext => ({
    sourceData: sourceOverride || snapshot?.sourceData || {},
    jobFields: snapshot?.jobFields || {},
    webData: [{ automationId: String(automation?.id || ""), fields: [field] }],
    selectedAutomationId: String(automation?.id || ""),
    masterFieldComputedValues: snapshot?.computedMaster || {},
    relationshipData: relationshipData[0],
    taskId: String(task?.id || ""),
    currentIndividualId,
    task,
  }), [snapshot, automation, relationshipData, task])

  const docsFor = useCallback((col: ColDef, docIds: string[]) =>
    (docsByEntity[String(col.id)] || []).filter((d: any) => docIds.includes(d.document_id)), [docsByEntity])

  const { documents, letters, fields } = useMemo(() => {
    const documents: DocReadinessItem[] = []
    const letters: DocReadinessItem[] = []
    const fields: FieldReadinessItem[] = []
    if (!automation || !snapshot) return { documents, letters, fields }

    const requirements = task?.requirements || []
    const seen = new Set<string>()

    const addDocItem = (docField: any, parentOptional: boolean) => {
      const docIds: string[] = docField.linkedKycDocuments || (docField.kycDocumentId ? [docField.kycDocumentId] : [])
      if (docIds.length === 0) return
      const requirement = docField.linkedRequirementId ? requirements.find((r: any) => String(r.id) === String(docField.linkedRequirementId)) : null
      const docId = requirement?.document_id || requirement?.document_ids?.[0] || docIds[0]
      const docMeta = kycDocsMap?.get?.(docId) || null
      const isLetter = isTemplateEligible(requirement || {}, docMeta)
      const optional = parentOptional || docField.isOptional === true || requirement?.isRequired === false
      columns.forEach(col => {
        if (!isFieldApplicable(docField, col)) return
        // Same document type for the same person counts once, even if two fields map to it.
        const key = `doc:${docIds.slice().sort().join(",")}:${col.id}`
        if (seen.has(key)) return
        seen.add(key)
        const doc = latestDoc(docsFor(col, docIds))
        const item: DocReadinessItem = {
          kind: isLetter ? "letter" : "document",
          key, label: docMeta?.display_name || docMeta?.name || requirement?.name || getFieldLabel(docField),
          col, docIds, docId, docMeta, requirement, doc, satisfied: !!doc, optional,
        }
        ;(isLetter ? letters : documents).push(item)
      })
    }

    // Build a flat map of all job questions so we can evaluate dependency
    // visibility without traversing the question hierarchy.
    const questionsById: Record<string, any> = {}
    ;(task?.job_specific_questions || []).forEach((q: any) => {
      questionsById[String(q.id)] = q
    })

    // Current answers saved by the user in the job-specific questions form.
    const taskRecord = snapshot.sourceData["tm_tasks"]?.[String(task?.id)]
    const jobAnswers: Record<string, any> = taskRecord?.job_specific_answers || {}

    /**
     * Returns true when the sub-field (or plain field) should be counted as required.
     * A field whose linked job question IDs are ALL hidden by dependency rules is
     * treated as NOT required — the path wasn't taken, so no data is expected.
     */
    const isLinkedQuestionsVisible = (qIds: string[]): boolean => {
      if (qIds.length === 0) return true // no linked questions → always required
      return qIds.some(qId => checkJobQuestionVisible(qId, questionsById, jobAnswers))
    }

    ;(automation.webdata || []).forEach((field: any) => {
      const fieldKey = getFieldKey(field)
      const fieldOptional = field.isOptional === true

      if (field.fieldType === "document") { addDocItem(field, fieldOptional); return }
      if (field.fieldType === "computed") return

      if (field.fieldType === "array") {
        const subFields = field.arrayItems || []
        subFields.filter((it: any) => it.type === "document")
          .forEach((it: any) => addDocItem({ ...it, entityTypes: it.entityTypes || field.entityTypes }, fieldOptional))

        const rows = getArrayFieldDataImpl(field, ctxFor(field, String(task?.individual_id || "")))
        rows.forEach((row: any) => {
          const col = columns.find(c => String(c.id) === String(row.entityId))
            || { type: "individual", id: row.entityId, label: `Entry ${row.index + 1}`, subLabel: "", priority: 99 }
          subFields.forEach((it: any) => {
            if (it.type === "document") return
            const mIds = it.linkedMasterFields || it.masterFieldIds || (it.linkedMasterFieldId ? [it.linkedMasterFieldId] : [])
            const qIds = it.linkedJobQuestionIds || []
            if (mIds.length === 0 && qIds.length === 0) return
            const overrideKey = `${fieldKey}.${it.variableName}::${row.entityId}`
            const value = overrides[overrideKey] ?? row[it.variableName]
            const entityCategory = (it.entityTypes || field.entityTypes || []).includes("company") ? "company" : "individual"
            const masterFieldId = mIds[0] ?? null
            const questionId = masterFieldId == null ? (qIds[0] ?? null) : null
            // If this sub-field is linked only to job questions AND all those questions
            // are hidden by dependency rules, the field is not applicable for this path.
            const linkedQVisible = mIds.length > 0 || isLinkedQuestionsVisible(qIds)
            const satisfied = isValidValue(value) || !linkedQVisible
            fields.push({
              kind: "field", key: overrideKey, label: getFieldLabel(it), groupLabel: getFieldLabel(field), col, value,
              satisfied,
              optional: fieldOptional || it.isOptional === true || !linkedQVisible,
              fieldType: it.type || "text", options: optionsOf(snapshot.jobFields[String(masterFieldId)]),
              persistable: !!getPersistenceSource(snapshot.jobFields, masterFieldId, questionId, entityCategory),
              masterFieldId, questionId, entityId: String(row.entityId), entityCategory, overrideKey,
            })
          })
        })
        return
      }

      // Plain field. Preset values are configuration, not something to fill in.
      if (field.defaultValue && field.defaultValue !== "Missing" && field.defaultValue !== "") return
      const mIds = field.linkedMasterFields || field.masterFieldIds || []
      const qIds = field.linkedJobQuestionIds || []
      if (mIds.length === 0 && qIds.length === 0 && !field.customFieldSource) return
      const entityCategory = field.entityTypes?.includes("company") ? "company" : "individual"
      const masterFieldId = mIds[0] ?? null
      const questionId = masterFieldId == null ? (qIds[0] ?? null) : null

      columns.forEach(col => {
        if (!isFieldApplicable(field, col)) return
        const ctx = ctxFor(field, col.type === "company" ? String(task?.individual_id || "") : String(col.id))
        const targetId = resolveTargetEntityIdImpl(field, ctx)
        // A field applicable to several columns that all resolve to the same record
        // is one thing to fill in, shown under the person it actually belongs to.
        const overrideKey = `${fieldKey}::${targetId ?? `col-${col.id}`}`
        if (seen.has(overrideKey)) return
        seen.add(overrideKey)
        const owner = columns.find(c => String(c.id) === String(targetId)) || col
        const value = overrides[overrideKey] ?? (targetId != null ? resolveVariableValueImpl(field, String(targetId), ctx) : null)
        // If this field is linked only to job questions AND all those questions are
        // hidden by dependency rules, treat it as not applicable for this path.
        const plainLinkedQVisible = mIds.length > 0 || !!field.customFieldSource || isLinkedQuestionsVisible(qIds)
        const satisfied = isValidValue(value) || !plainLinkedQVisible
        fields.push({
          kind: "field", key: overrideKey, label: getFieldLabel(field), col: owner, value,
          satisfied,
          optional: fieldOptional || !plainLinkedQVisible,
          fieldType: field.fieldType || "text", options: optionsOf(snapshot.jobFields[String(masterFieldId)]),
          persistable: targetId != null && !!getPersistenceSource(snapshot.jobFields, masterFieldId, questionId, entityCategory),
          masterFieldId, questionId, entityId: targetId != null ? String(targetId) : null, entityCategory, overrideKey,
        })
      })
    })

    return { documents, letters, fields }
  }, [automation, snapshot, task, columns, kycDocsMap, docsFor, ctxFor, overrides])

  const summary = useMemo(() => ({
    documents: summarize(documents),
    fields: summarize(fields),
    letters: summarize(letters),
  }), [documents, fields, letters])

  const requiredMissing = summary.documents.requiredMissing + summary.fields.requiredMissing + summary.letters.requiredMissing
  const optionalMissing = summary.documents.optionalMissing + summary.fields.optionalMissing + summary.letters.optionalMissing
  const canRun = status === "ready" && requiredMissing === 0

  const setOverride = useCallback((key: string, value: any) => {
    setOverrides(prev => {
      const next = { ...prev, [key]: value }
      if (cacheKey) overrideCache.set(cacheKey, next)
      return next
    })
  }, [cacheKey])

  /** Persists a value to its source record and patches the local snapshot - no refetch. */
  const saveField = useCallback(async (item: FieldReadinessItem, rawValue: string) => {
    if (!snapshot) return { persisted: false }
    let value = rawValue
    const match = item.options.find(o => o.value === rawValue)
    if (match) value = match.label

    const source = item.entityId != null ? getPersistenceSource(snapshot.jobFields, item.masterFieldId, item.questionId, item.entityCategory) : null
    if (!source?.table || !source?.path) {
      setOverride(item.overrideKey, value)
      return { persisted: false }
    }
    const updated = await persistFieldValue({
      persistenceSource: source, entityId: item.entityId, value,
      cachedRecord: snapshot.sourceData[source.table]?.[item.entityId], actorId,
    })
    const next: Snapshot = {
      ...snapshot,
      sourceData: { ...snapshot.sourceData, [source.table]: { ...(snapshot.sourceData[source.table] || {}), [item.entityId]: updated } },
    }
    if (cacheKey) snapshotCache.set(cacheKey, next)
    setSnapshot(next)
    // A stale local override would otherwise shadow the value just written.
    if (overrides[item.overrideKey] !== undefined) {
      setOverrides(prev => {
        const { [item.overrideKey]: _, ...rest } = prev
        if (cacheKey) overrideCache.set(cacheKey, rest)
        return rest
      })
    }
    return { persisted: true }
  }, [snapshot, actorId, cacheKey, overrides, setOverride])

  /** The payload the automation server receives - same shape the Automation tab sends. */
  const buildFormData = useCallback(() => {
    const formData: Record<string, any> = {}
    if (!automation || !snapshot) return formData
    const fallbackTarget = String(task?.individual_id || "")
    ;(automation.webdata || []).forEach((f: any) => {
      const fieldKey = getFieldKey(f)
      const baseCtx = ctxFor(f, fallbackTarget)
      const targetId = String(resolveTargetEntityIdImpl(f, baseCtx) || fallbackTarget)
      if (f.fieldType === "array") {
        formData[f.variableName] = getArrayFieldDataImpl(f, baseCtx).map((row: any) => {
          const merged = { ...row }
          ;(f.arrayItems || []).forEach((it: any) => {
            const ov = overrides[`${fieldKey}.${it.variableName}::${row.entityId}`]
            if (ov !== undefined) merged[it.variableName] = ov
          })
          return merged
        })
      } else if (f.fieldType === "document") {
        const docIds = f.linkedKycDocuments || []
        const doc = latestDoc((docsByEntity[targetId] || []).filter((d: any) => docIds.includes(d.document_id)))
        formData[f.variableName] = doc?.file_path ? getFileUrl(doc.file_path) : null
      } else if (f.fieldType === "computed") {
        formData[f.variableName] = snapshot.computedPreview[f.variableName]
      } else {
        const ov = overrides[`${fieldKey}::${targetId}`]
        const val = ov !== undefined ? ov : resolveVariableValueImpl(f, targetId, baseCtx)
        formData[f.variableName] = val === "Missing" ? null : cleanFieldValue(val)
      }
    })
    return formData
  }, [automation, snapshot, task, ctxFor, overrides, docsByEntity])

  return {
    status, error, refreshing, columns,
    documents, letters, fields, summary,
    canRun, requiredMissing, optionalMissing,
    saveField, buildFormData, reload: load,
    masterFieldsReady: !!snapshot,
  }
}
