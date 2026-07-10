// @ts-nocheck
import { supabase } from "@/lib/supabase/client"
import { fetchSourceDataImpl } from "../../tasks/utils/fieldResolution"

/**
 * Resolves the job-field definitions and their live values for a set of automations,
 * for a single task. Shared by every place that opens SendRequirementsDialog (the
 * Requirements tab and the "Checklist" stage-cell action in DepartmentTasksManager)
 * so both entry points show identical field/question data for the same task.
 *
 * Ported from the effects in job-workspace/tabs/RequirementsTab.tsx - keep this the
 * single source of truth rather than re-inlining the fetch logic elsewhere.
 */
export async function resolveAutomationFieldData(
  automations: any[],
  relationshipData: any[],
  task: any
): Promise<{
  jobFieldsRecord: Record<string, any>
  fieldSourceDataCache: Record<string, Record<string, any>>
  fieldMasterComputedCache: Record<string, any>
}> {
  const linkedFieldIds = new Set<string>()
  ;(automations || []).forEach((auto: any) => {
    if (auto.webdata && auto.webdata.length > 0) {
      auto.webdata.forEach((field: any) => {
        ;(field.linkedMasterFields || field.masterFieldIds || []).forEach((id: any) => linkedFieldIds.add(String(id)))
        ;(field.arrayItems || []).forEach((item: any) => {
          ;(item.linkedMasterFields || item.masterFieldIds || (item.linkedMasterFieldId ? [item.linkedMasterFieldId] : [])).forEach((id: any) => linkedFieldIds.add(String(id)))
        })
      })
    }
  })

  let jobFieldsRecord: Record<string, any> = {}
  if (linkedFieldIds.size > 0) {
    const { data: fields } = await supabase.from('tm_job_fields').select('*').in('id', Array.from(linkedFieldIds))
    if (fields) {
      jobFieldsRecord = fields.reduce((acc: Record<string, any>, field: any) => {
        acc[String(field.id)] = field
        return acc
      }, {})
    }
  }

  const mergedSource: Record<string, Record<string, any>> = {}
  const mergedComputed: Record<string, any> = {}

  if (Object.keys(jobFieldsRecord).length > 0 && (relationshipData || []).length > 0) {
    const calls: Promise<void>[] = []
    ;(automations || []).forEach((auto: any) => {
      if (!auto.webdata?.length) return
      ;(relationshipData || []).forEach((relData: any) => {
        calls.push(
          fetchSourceDataImpl({
            selectedAutomationId: String(auto.id),
            webData: [{ automationId: String(auto.id), fields: auto.webdata }],
            jobFields: jobFieldsRecord,
            relationshipData: relData,
            taskId: String(task?.id || ""),
            currentIndividualId: String(task?.individual_id || ""),
            task
          }).then(({ sourceData: sd, masterFieldComputedValues: mc }) => {
            Object.entries(sd).forEach(([table, records]) => {
              if (!mergedSource[table]) mergedSource[table] = {}
              Object.assign(mergedSource[table], records)
            })
            if (mc) Object.assign(mergedComputed, mc)
          }).catch(err => console.error('Error resolving field values', err))
        )
      })
    })
    await Promise.all(calls)
  }

  return {
    jobFieldsRecord,
    fieldSourceDataCache: mergedSource,
    fieldMasterComputedCache: mergedComputed,
  }
}
