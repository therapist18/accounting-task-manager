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
    // JobFieldSource['linking_variable'] is typed as 'id' | 'director_id' |
    // null in master-fields/components/types/database.ts, but the Master
    // Fields admin UI (link-sources-dialog.tsx) actually also writes
    // 'individual_id' / 'company_id' - that type is stale, not this code, so
    // read it as a plain string here rather than fight the narrower type.
    const sources = (field.sources || [])
      .filter((s) => s.source_type === 'individual' || s.source_type === 'company')
      .filter((s) => {
        const lv = s.linking_variable as string | null | undefined;
        return lv === 'individual_id' || lv === 'company_id' || lv === 'id' || !lv;
      })
      .sort((a, b) => a.priority - b.priority);

    for (const source of sources) {
      const linkingVariable = source.linking_variable as string | null | undefined;
      // acc_portal_company_duplicate IS the company table - its own primary
      // key (`id`) is the company id, there's no separate `company_id`
      // column on it (unlike child/document tables such as
      // acc_portal_kyc_uploads, which reference a company via a real
      // company_id FK). Force `id` for it regardless of what linking_variable
      // says, since 'company_id' against this table 400s at the DB level.
      const isCompanyTableItself = source.table === 'acc_portal_company_duplicate';
      const usesCompanyId = !isCompanyTableItself && (linkingVariable === 'company_id' || (source.source_type === 'company' && !linkingVariable));
      const idColumn = isCompanyTableItself ? 'id' : usesCompanyId ? 'company_id' : 'individual_id';
      const idValue = isCompanyTableItself || usesCompanyId ? companyId : individualId;
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
