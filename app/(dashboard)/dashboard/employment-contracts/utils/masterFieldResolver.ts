import supabase from '@/lib/supabase/client';
import { parseJsonValue } from '../../tasks/utils/AutomationMappingDialog';
import type { JobField } from '../../master-fields/components/types/database';

// Resolves tm_job_fields ("master field") values for one employee/company
// pair - the same source_type/table/path/priority/linking_variable shape
// Document Template Manager already uses (see JobFieldSource), reused here
// instead of a second source-mapping format.
//
// Deliberately NOT reusing tasks/utils/fieldResolution.ts's
// fetchSourceDataImpl - that resolver is built for the automations/webdata
// engine and expects a task/relationshipData/automation shape that doesn't
// exist in the contract wizard (one employee, one company, no task). This
// is the small, purpose-built equivalent: only handles the 'individual' and
// 'company' source types EC actually needs (not 'document').
//
// Returns values keyed by tm_job_fields.id (NOT field_key) - the caller
// (standardPlaceholders.ts) maps id -> ec_placeholders.key via each
// placeholder's own master_field_id link.
export async function resolveMasterFieldValues(
  fields: JobField[],
  individualId: number | null | undefined,
  companyId: number | string | null | undefined
): Promise<Record<string, string>> {
  const result: Record<string, string> = {};

  await Promise.all(fields.map(async (field) => {
    const sources = (field.sources || [])
      .filter((s) => s.source_type === 'individual' || s.source_type === 'company')
      .filter((s) => s.linking_variable === 'individual_id' || s.linking_variable === 'company_id' || !s.linking_variable)
      .sort((a, b) => a.priority - b.priority);

    for (const source of sources) {
      const usesCompanyId = source.linking_variable === 'company_id' || (source.source_type === 'company' && !source.linking_variable);
      const idColumn = usesCompanyId ? 'company_id' : 'individual_id';
      const idValue = usesCompanyId ? companyId : individualId;
      if (idValue === null || idValue === undefined) continue;

      const rootColumn = source.path.split(/->>?/)[0].trim().replace(/['"]/g, '');
      const { data, error } = await supabase
        .from(source.table)
        .select(rootColumn)
        .eq(idColumn, idValue)
        .maybeSingle();

      if (error || !data) continue;
      const value = parseJsonValue(data, source.path);
      if (value !== undefined && value !== null && value !== '') {
        result[field.id] = String(value);
        return;
      }
    }
  }));

  return result;
}
