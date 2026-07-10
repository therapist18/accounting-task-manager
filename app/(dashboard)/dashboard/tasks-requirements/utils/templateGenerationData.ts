// @ts-nocheck
import { supabase } from "@/lib/supabase/client"

/**
 * Builds the data TemplateGenerationDialog needs to actually resolve placeholders and
 * render a real preview (masterFields, entityIdMap, sourceDataCache, personData,
 * companyData, relationshipData). Ported from RequirementsTableCombined.tsx's
 * handleOpenTemplateGenerator (and its supporting fetchDocumentTemplates / master-fields
 * fetch) so every place that opens the dialog builds this the same, working way.
 * RequirementsTableCombined.tsx itself is left untouched - this is a generalized copy,
 * not a shared import from it, since that function is entangled with that file's
 * multi-task column state.
 */

/**
 * Same three signals RequirementsTable.tsx uses to classify a requirement as
 * template-eligible (RequirementsTable.tsx:649-656,951): the requirement's own
 * hasTemplate flag, the linked KYC document type's has_template flag, or the
 * document type being categorized as a Letter.
 */
// acc_portal_kyc.has_template is stored as the text string "true"/"false" (not a real
// boolean column) - a raw truthy check on the string "false" would incorrectly pass, so
// this normalizes both real booleans and the text-string form before checking.
const isTruthyFlag = (val: any): boolean => {
  if (typeof val === 'boolean') return val
  if (typeof val === 'string') return val.trim().toLowerCase() === 'true'
  return false
}

export function isTemplateEligible(req: any, docMeta: any): boolean {
  const eligible = isTruthyFlag(req?.hasTemplate) || isTruthyFlag(docMeta?.has_template) || docMeta?.main_category === 'Letters'
  console.log('[isTemplateEligible]', {
    reqId: req?.id,
    reqName: req?.name,
    reqHasTemplate: req?.hasTemplate,
    docId: docMeta?.id,
    docHasTemplate: docMeta?.has_template,
    docMainCategory: docMeta?.main_category,
    eligible,
  })
  return eligible
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const parseAndCleanUUIDs = (input: any): string[] => {
  if (!input) return []
  const uuidRegex = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi
  const inputString = Array.isArray(input) ? input.join(',') : String(input)
  const matches = inputString.match(uuidRegex) || []
  return [...new Set(matches)]
}

export async function fetchMasterFields(): Promise<Map<number, any>> {
  const { data, error } = await supabase.from('tm_job_fields').select('*').order('id', { ascending: true })
  if (error) {
    console.error('Failed to fetch master fields:', error)
    return new Map()
  }
  return new Map((data || []).map((field: any) => [field.id, field]))
}

export async function fetchDocumentTemplates(documentId: string, task: any, jobLevel?: any): Promise<any[]> {
  try {
    const bankParticipant = task.participants_details?.find((p: any) => p.type === 'bank')
    const bankId = bankParticipant?.id

    let query = supabase
      .from('acc_portal_templates')
      .select('*')
      .eq('document_id', documentId)

    if (jobLevel) {
      query = query.filter('job_level', 'cs', JSON.stringify([jobLevel]))
    }
    query = query.order('file_name', { ascending: true })
    if (bankId) {
      query = query.filter('banks_associated', 'cs', `[{"bank_id":${bankId},"bank_name":"${bankParticipant.name}"}]`)
    }

    const { data: templates, error } = await query
    if (error) throw error
    return templates || []
  } catch (error) {
    console.error('Error fetching document templates:', error)
    return []
  }
}

/**
 * @param docItem - { document: { id, display_name, ... } } (a KYC document type record)
 * @param task - the full task record
 * @param colType - target entity type: 'company' | 'principal' | 'director' | 'dependant' | 'understudy' | 'sponsor'
 * @param colId - target entity id for colType
 * @param masterFields - Map<number, field> from fetchMasterFields()
 * @param jobLevel - task.job_level, used to scope which templates are eligible
 * @param selectedTemplateId - if the requirement config pins a specific template (set via
 *   EditRequirementDialog's template picker), prefer it over the "only one? use it" default
 * @returns the letterInfo object TemplateGenerationDialog expects, or null if no templates exist for this document
 */
export async function buildTemplateGenerationInfo(
  docItem: { document: any },
  task: any,
  colType: string,
  colId: any,
  masterFields: Map<number, any>,
  jobLevel?: any,
  selectedTemplateId?: string
): Promise<any | null> {
  let companyId = task.company_id
  let companyName = task.company_name
  if (!companyId && task.participants_details) {
    const companyPart = task.participants_details.find((p: any) => p.type === 'company')
    companyId = companyPart?.id
    companyName = companyPart?.name
  }
  if (!companyId && task.applicant_details?.type === 'company') {
    companyId = task.applicant_details.id
    companyName = task.applicant_details.name
  }

  const directors = task.participants_details?.filter((p: any) => p.type === 'individual' && (Array.isArray(p.role) ? p.role.includes('director') : p.role === 'director')) || []
  const dependants = task.participants_details?.filter((p: any) => p.type === 'individual' && (Array.isArray(p.role) ? (p.role.includes('dependant') || p.role.includes('dependent')) : (p.role === 'dependant' || p.role === 'dependent'))) || []
  const understudyPart = task.participants_details?.find((p: any) => p.type === 'individual' && (Array.isArray(p.role) ? p.role.includes('understudy') : p.role === 'understudy'))
  const sponsorPart = task.participants_details?.find((p: any) => p.type === 'individual' && (Array.isArray(p.role) ? p.role.includes('sponsor') : p.role === 'sponsor'))

  const entityIdMap: Record<string, any> = {
    company: companyId,
    directors: directors.map((d: any) => d.id),
    director: colType === 'director' ? colId : (directors[0]?.id || null),
    principal: (() => {
      if (colType === 'principal') return colId
      const principalPart = task.participants_details?.find((p: any) =>
        p.type === 'individual' && (Array.isArray(p.role) ? p.role.includes('principal') : p.role === 'principal')
      )
      if (principalPart) return principalPart.id
      if (task.applicant_details?.type === 'individual') return task.applicant_details.id
      return null
    })(),
    dependants: dependants.map((d: any) => d.id),
    understudy: colType === 'understudy' ? colId : (understudyPart?.id || null),
    sponsor: colType === 'sponsor' ? colId : (sponsorPart?.id || null),
  }

  const templates = await fetchDocumentTemplates(docItem.document.id, task, jobLevel)
  if (!templates || templates.length === 0) return null

  // Grouped by (table, linking_variable) so each fetch can filter by BOTH the entity id(s)
  // AND the document id(s) together, instead of two independent broad queries unioned
  // together (which used to fetch e.g. every entity's copy of a document type, or every
  // document an entity has of any type - correct in the end since processTextField/
  // processImageField re-filter in memory, but needlessly wide).
  const queriesToRun = new Map<string, Map<string, { docIds: Set<string>; entityIds: Set<any> }>>()
  const addQuery = (tableName: string, docId: string | null, linkVar: string | null, entId: any) => {
    const key = linkVar || 'id'
    if (!queriesToRun.has(tableName)) queriesToRun.set(tableName, new Map())
    const byLinkVar = queriesToRun.get(tableName)!
    if (!byLinkVar.has(key)) byLinkVar.set(key, { docIds: new Set(), entityIds: new Set() })
    const entry = byLinkVar.get(key)!
    if (docId) entry.docIds.add(docId)
    const addEntity = (id: any) => {
      const val = (id && typeof id === 'object') ? (id.id || id.director_id || id.individual_id || id.company_id) : id
      if (val) entry.entityIds.add(val)
    }
    if (Array.isArray(entId)) entId.forEach(addEntity)
    else if (entId) addEntity(entId)
  }

  templates.forEach((template: any) => {
    ;(template.placeholders || []).forEach((placeholder: any) => {
      const pids = placeholder.master_field_ids || (placeholder.master_field_id ? [placeholder.master_field_id] : [])
      pids.forEach((id: any) => {
        const masterField = masterFields.get(parseInt(id, 10))
        if (masterField?.sources) {
          const entityId = entityIdMap[placeholder.entity_type || 'principal']
          if (entityId) {
            masterField.sources.forEach((source: any) => {
              const { table, linking_variable, document_id } = source
              if (!table) return
              const validDocIds = document_id ? parseAndCleanUUIDs(document_id) : []
              if (validDocIds.length > 0) {
                validDocIds.forEach((vid: string) => addQuery(table, vid, linking_variable || 'id', entityId))
              } else {
                addQuery(table, null, linking_variable || 'id', entityId)
              }
            })
          }
        }
      })

      if (placeholder.type === 'document_checklist' && placeholder.linked_document_ids) {
        const dataSource = placeholder.checklist_data_source || { table: 'acc_portal_kyc_uploads', linking_variable: 'company_id' }
        const entityId = entityIdMap[Array.isArray(placeholder.entity_type) ? placeholder.entity_type[0] : (placeholder.entity_type || 'company')]
        if (entityId) {
          placeholder.linked_document_ids.forEach((did: string) => addQuery(dataSource.table, did, dataSource.linking_variable, entityId))
        }
      }
    })
  })

  const sourceDataCache: Record<string, Record<number, any>> = { tm_tasks: { [task.id]: task } }

  const fetchPromises: Promise<{ table: string; data: any[] }>[] = []
  queriesToRun.forEach((byLinkVar, table) => {
    byLinkVar.forEach(({ docIds, entityIds }, linkVar) => {
      const entityIdList = Array.from(entityIds).filter(Boolean)
      if (entityIdList.length === 0) return
      fetchPromises.push((async () => {
        let query = supabase.from(table).select('*').in(linkVar, entityIdList)
        const validDocIds = [...docIds].filter((id: string) => UUID_REGEX.test(id))
        if (validDocIds.length > 0) query = query.in('document_id', validDocIds)
        const { data } = await query
        return { table, data: data || [] }
      })())
    })
  })

  const results = await Promise.all(fetchPromises)
  const mergedByTable: Record<string, Record<any, any>> = {}
  results.forEach(({ table, data }) => {
    if (!mergedByTable[table]) mergedByTable[table] = {}
    data.forEach((rec: any) => { mergedByTable[table][rec.id] = rec })
  })
  Object.entries(mergedByTable).forEach(([table, data]) => { sourceDataCache[table] = data })

  const relationshipData = {
    company: task.participants_details?.find((p: any) => p.type === 'company') || (task.applicant_details?.type === 'company' ? task.applicant_details : null) || { id: task.company_id, name: task.company_name, type: 'company' },
    directors: (() => {
      if (colType === 'director') {
        const directorId = colId
        let specificDirector = task.participants_details?.find((p: any) => p.type === 'individual' && p.id === directorId)
        if (!specificDirector && sourceDataCache['registry_individuals']) {
          specificDirector = sourceDataCache['registry_individuals'][directorId]
          if (specificDirector) specificDirector = { ...specificDirector, type: 'individual' }
        }
        return specificDirector ? [specificDirector] : []
      }
      return directors
    })(),
    principal: task.participants_details?.find((p: any) => p.type === 'individual' && (Array.isArray(p.role) ? p.role.includes('principal') : p.role === 'principal')) || (task.applicant_details?.type === 'individual' ? task.applicant_details : null),
    dependants,
    understudy: understudyPart,
    sponsor: sponsorPart,
  }

  return {
    document: docItem.document,
    task,
    masterFields,
    entityIdMap,
    sourceDataCache,
    availableTemplates: templates,
    template: (selectedTemplateId && templates.find((t: any) => t.id === selectedTemplateId)) || (templates.length === 1 ? templates[0] : null),
    personData: task.applicant_details?.type === 'individual' ? task.applicant_details : {},
    companyData: task.applicant_details?.type === 'company' ? task.applicant_details : {},
    extractedData: task.applicant_details || {},
    relationshipData,
    activeEntityType: colType,
    activeEntityId: colId,
  }
}
