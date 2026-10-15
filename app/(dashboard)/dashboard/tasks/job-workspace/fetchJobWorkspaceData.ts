// @ts-nocheck
"use client"

import { supabase } from "@/lib/supabase/client"
import { fetchStages, type Department } from "../utils/taskManagerData"

export interface JobWorkspaceData {
  task: any | null
  department: any | null
  subdepartment: any | null
  stages: any[]
  individual: any | null
  companies: Map<number, { name: string; prefix: string }>
  kycDocsMap: Map<string, any>
  /** All director documents (for individual lookups) */
  allDocuments: any[]
  /** Documents keyed by individual_id */
  documentsByIndividual: Record<number, any[]>
  /** Company KYC uploads */
  allCompanyDocuments: any[]
  /** Automations for this job level (sourced from requirement web_automation AND stage/document targetEntities) */
  automations: any[]
  /** For each automation id, which stages/requirements reference it - lets the Automation tab show where each one is linked from */
  automationLinkSources: Record<string, { stages: { id: string; name: string }[]; requirements: { id: string; name: string }[] }>
  /** Templates for this task's job level */
  templates: any[]
  loading: boolean
  error: string | null
}

export const fetchJobWorkspaceData = async (taskId: string): Promise<JobWorkspaceData> => {
  const result: JobWorkspaceData = {
    task: null,
    department: null,
    subdepartment: null,
    stages: [],
    individual: null,
    companies: new Map(),
    kycDocsMap: new Map(),
    allDocuments: [],
    documentsByIndividual: {},
    allCompanyDocuments: [],
    automations: [],
    automationLinkSources: {},
    templates: [],
    loading: true,
    error: null,
  }

  try {
    // 1. Fetch the task
    const { data: taskData, error: taskError } = await supabase
      .from('tm_tasks')
      .select('*')
      .eq('id', taskId)
      .single()

    if (taskError) throw taskError
    if (!taskData) {
      result.error = "Task not found"
      result.loading = false
      return result
    }

    // Pure sync derivations from taskData - no I/O, so these can all be computed
    // before firing off the parallel batch below.
    const jobLevel = taskData.job_level || {}
    const individualIdNum = Number(taskData.individual_id)
    const participantIds = (taskData.participants_details || [])
      .filter((p: any) => p.type === 'individual' && p.id)
      .map((p: any) => Number(p.id))
      .filter((id: number) => !isNaN(id) && id !== individualIdNum)
    const allDirectorIds = taskData.individual_id
      ? [individualIdNum, ...participantIds]
      : participantIds

    const taskCompanyIds = new Set<number>()
    if (taskData.applicant_details?.type === 'company' && taskData.applicant_details?.id) {
      taskCompanyIds.add(Number(taskData.applicant_details.id))
    }
    ;(taskData.participants_details || []).forEach((p: any) => {
      if (p.type === 'company' && p.id) taskCompanyIds.add(Number(p.id))
    })
    if (taskData.company_id) taskCompanyIds.add(Number(taskData.company_id))

    // 2. Everything below only depends on taskData (or nothing at all) - fire it
    // all in one wave instead of one-round-trip-at-a-time. Each promise is
    // individually .catch()-guarded so one failing query doesn't sink the batch,
    // matching the try/catch-per-query resilience this file had before.
    const noop = { data: null as any }
    const [
      { data: deptData },
      { data: compData },
      { data: kycData, error: kycError },
      { data: requirementsData },
      { data: indData },
      { data: allDirectorDocsData },
      { data: kycUploadData },
    ] = await Promise.all([
      // tm_subdepartments must be explicitly embedded - a plain select('*') never
      // returns related tables (PostgREST requires the explicit embed syntax below).
      // subdepartment.classes is a plain jsonb column on tm_subdepartments, already
      // included once the embed is present - no need to list it separately.
      supabase.from('tm_departments').select('*, tm_subdepartments(*)'),
      Promise.resolve(supabase.from('acc_portal_company_duplicate').select('id, company_name')).catch(() => noop),
      supabase.from('acc_portal_kyc').select('id, fields, name, display_name, has_template, main_category'),
      supabase.from('tm_class_requirements').select('*'),
      taskData.individual_id
        ? supabase.from('registry_individuals').select('*').eq('id', taskData.individual_id).single()
        : Promise.resolve(noop),
      allDirectorIds.length > 0
        ? Promise.resolve(supabase.from('acc_portal_directors_documents').select('*, acc_portal_kyc(id, name, display_name)').in('director_id', allDirectorIds).order('created_at', { ascending: false })).catch(() => noop)
        : Promise.resolve(noop),
      taskCompanyIds.size > 0
        ? supabase.from('acc_portal_kyc_uploads').select('*').in('company_id', Array.from(taskCompanyIds))
        : Promise.resolve(noop),
    ])

    const departments: Department[] = (deptData || []).map((d: any) => ({
      ...d,
      id: Number(d.id),
      stages: d.stages || [],
      tm_subdepartments: d.tm_subdepartments || [],
    }))

    const department = departments.find(d => d.id === Number(jobLevel.department_id)) || null
    const subdepartment = department?.tm_subdepartments?.find(
      (s: any) => s.id === Number(jobLevel.subdepartment_id)
    ) || null

    // Fetch stages for the department (pure JS over `departments` - no network I/O)
    const stages = await fetchStages(String(jobLevel.department_id), departments)

    const individual = indData || null

    const companies = new Map(
      (compData || []).map((c: any) => [c.id, { name: c.company_name, prefix: '' }])
    )

    // Split the single merged directors_documents result by director_id, same
    // bucketing this file always did across the (previously two) queries.
    const documentsByIndividual: Record<string, any[]> = { [individualIdNum]: [] }
    ;(allDirectorDocsData || []).forEach((doc: any) => {
      if (!documentsByIndividual[doc.director_id]) documentsByIndividual[doc.director_id] = []
      documentsByIndividual[doc.director_id].push(doc)
    })
    const docsForIndividual: any[] = documentsByIndividual[individualIdNum] || []

    const allCompanyDocuments: any[] = kycUploadData || []

    if (kycError) console.error('[fetchJobWorkspaceData] acc_portal_kyc fetch error:', kycError)
    const kycDocsMap = new Map()
    ;(kycData || []).forEach((doc: any) => {
      kycDocsMap.set(doc.id, {
        id: doc.id,
        name: doc.name,
        display_name: doc.display_name,
        fields: doc.fields || [],
        has_template: doc.has_template,
        main_category: doc.main_category || null,
      })
    })
    console.log('[fetchJobWorkspaceData] kycDocsMap size:', kycDocsMap.size, 'docs with has_template set:', (kycData || []).filter((d: any) => d.has_template).length)

    // Process task - apply requirement matching
    const matchingRequirements = (requirementsData || []).filter((req: any) => {
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
    const allJobQuestions: any[] = []
    const seenQIds = new Set<string>()
    matchingRequirements?.forEach((req: any) => {
      if (req.requirements) allReqs.push(...req.requirements)
      // Collect job-specific questions (for dependency-visibility in the Guided Application)
      ;(req.job_specific_questions || []).forEach((q: any) => {
        const id = String(q.id)
        if (!seenQIds.has(id)) { seenQIds.add(id); allJobQuestions.push(q) }
      })
    })

    // 11. Fetch automations referenced by matching requirements (requirement-level linkage)
    // AND by this task's stage/document targetEntities (stage-level linkage) - same job_level
    // matching EditableStageCell's currentAutomationConfig uses for the stage-cell redirect.
    const jlKey = (jl: any) => `${jl?.subdepartment_id}:${jl?.class_id || 0}:${jl?.subclass_id || 0}`
    const taskJobLevelKey = jlKey(jobLevel)

    const requirementAutomationLinks: { automationId: string; requirementId: string; requirementName: string }[] = allReqs
      .filter((r: any) => r.web_automation?.automationId)
      .map((r: any) => ({ automationId: r.web_automation.automationId, requirementId: r.id, requirementName: r.name }))

    const stageAutomationLinks: { automationId: string; stageId: string; stageName: string }[] = []
    ;(stages || []).forEach((stage: any) => {
      ;(stage.documents || []).forEach((doc: any) => {
        ;(doc.targetEntities || []).forEach((te: any) => {
          if (te.automationId && te.job_level && jlKey(te.job_level) === taskJobLevelKey) {
            stageAutomationLinks.push({ automationId: te.automationId, stageId: stage.id, stageName: stage.name })
          }
        })
      })
    })

    const autoIds = new Set([
      ...requirementAutomationLinks.map(l => l.automationId),
      ...stageAutomationLinks.map(l => l.automationId),
    ])

    // 12. Fetch automations (referenced by matching requirements/stages above) and
    // templates (for requirements that have hasTemplate) together - neither result
    // feeds the other, they only share the same upstream (allReqs/stages), so there's
    // no reason to await them one after another.
    const reqDocIds = allReqs
      .filter((r: any) => r.hasTemplate && (r.document_id || r.document_ids?.[0]))
      .map((r: any) => r.document_id || r.document_ids[0])

    const [autoResult, tplResult] = await Promise.all([
      autoIds.size > 0
        ? Promise.resolve(supabase.from('tm_automations').select('*').in('id', Array.from(autoIds)).order('created_at', { ascending: false })).catch(() => noop)
        : Promise.resolve(noop),
      reqDocIds.length > 0
        ? supabase.from('acc_portal_templates').select('*').in('document_id', reqDocIds)
        : Promise.resolve(noop),
    ])
    const automations: any[] = autoResult.data || []
    const templates: any[] = tplResult.data || []

    const automationLinkSources: JobWorkspaceData['automationLinkSources'] = {}
    autoIds.forEach(id => { automationLinkSources[id] = { stages: [], requirements: [] } })
    stageAutomationLinks.forEach(l => {
      const bucket = automationLinkSources[l.automationId]
      if (bucket && !bucket.stages.some(s => s.id === l.stageId)) bucket.stages.push({ id: l.stageId, name: l.stageName })
    })
    requirementAutomationLinks.forEach(l => {
      const bucket = automationLinkSources[l.automationId]
      if (bucket && !bucket.requirements.some(r => r.id === l.requirementId)) bucket.requirements.push({ id: l.requirementId, name: l.requirementName })
    })

    const officer = taskData.participants_details?.find((p: any) => p.role?.includes('officer'))
    const taskManager = taskData.participants_details?.find((p: any) => p.role?.includes('task_manager'))
    const company = taskData.participants_details?.find((p: any) => p.role?.includes('sponsor') || p.role?.includes('company'))

    const processedTask = {
      ...taskData,
      applicant_name: taskData.applicant_details?.name || taskData.applicant_name || '',
      company_name: company?.name || '',
      department_id: jobLevel.department_id,
      subdepartment_id: jobLevel.subdepartment_id,
      class_id: jobLevel.class_id,
      subclass_id: jobLevel.subclass_id,
      job_level: {
        level: jobLevel.level || 0,
        class_id: jobLevel.class_id || '',
        subclass_id: jobLevel.subclass_id || null,
        department_id: jobLevel.department_id,
        subdepartment_id: jobLevel.subdepartment_id,
      },
      officer: officer ? { id: officer.id, name: officer.name, email: officer.email || '', phone: officer.phone || '' } : undefined,
      task_manager: taskManager ? { id: taskManager.id, name: taskManager.name, email: taskManager.email || '', phone: taskManager.phone || '' } : undefined,
      requirements: allReqs || [],
      job_specific_questions: allJobQuestions,
      report_doc_defaults: [],
      referenceDocuments: {},
    }

    return {
      task: processedTask,
      department,
      subdepartment,
      stages,
      individual,
      companies,
      kycDocsMap,
      allDocuments: docsForIndividual,
      documentsByIndividual,
      allCompanyDocuments,
      automations,
      automationLinkSources,
      templates,
      loading: false,
      error: null,
    }
  } catch (error) {
    console.error('Error fetching job workspace data:', error)
    return {
      ...result,
      loading: false,
      error: error.message || 'Failed to load job workspace',
    }
  }
}
