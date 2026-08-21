// @ts-nocheck
import supabase from '@/lib/supabase/client';
import { processPlaceholderValue } from '../../tasks-requirements/utils/placeholderProcessors';
import { ecPlaceholderToDtmPlaceholder } from './ecPlaceholderAdapter';
import type { EcPlaceholder } from './ecPlaceholders';
import type { Placeholder } from '../../templates/document-template-manager/types';
import type { JobField } from '../../master-fields/components/types/database';
import type { JobFieldSource } from '../../master-fields/components/types/database';
import { writeMasterFieldSourceValue, pickMasterFieldSource } from '../../master-fields/utils/masterFieldValueResolver';

// ---------------------------------------------------------------------------
// Master-field-id collection (shared pattern with ccResolver)
// ---------------------------------------------------------------------------

function collectPlaceholderMasterFieldIds(p: Placeholder): number[] {
  const ids = new Set<number>();
  (p.master_field_ids || []).forEach((id) => ids.add(Number(id)));
  (p.conditions || []).forEach((c: any) => {
    if (c.master_field_id) ids.add(Number(c.master_field_id));
    if (c.comparison?.master_field_id) ids.add(Number(c.comparison.master_field_id));
    (c.additional_comparisons || []).forEach((ac: any) => {
      if (ac.master_field_id) ids.add(Number(ac.master_field_id));
    });
  });
  (p.boolean_conditions || []).forEach((bc: any) => {
    if (bc.master_field_id) ids.add(Number(bc.master_field_id));
  });
  return Array.from(ids);
}

// ---------------------------------------------------------------------------
// Table config collection (shared pattern with ccResolver)
// ---------------------------------------------------------------------------

function collectTableConfigs(
  placeholders: Placeholder[],
  entityIds: (string | number)[],
  masterFields: Map<number, JobField>,
): Map<string, Map<string, Set<string | number>>> {
  const tableConfigs = new Map<string, Map<string, Set<string | number>>>();

  const addConfig = (table: string, linkingVar: string, ids: (string | number)[]) => {
    if (!tableConfigs.has(table)) tableConfigs.set(table, new Map());
    const byLv = tableConfigs.get(table)!;
    if (!byLv.has(linkingVar)) byLv.set(linkingVar, new Set());
    const set = byLv.get(linkingVar)!;
    for (const id of ids) set.add(id);
  };

  // Master-field source tables
  for (const mf of masterFields.values()) {
    for (const source of (mf.sources || []) as any[]) {
      if (!['individual', 'company', 'document'].includes(source.source_type)) continue;
      if (!source.table) continue;
      const linkingVar = (source.linking_variable as string) || 'id';
      if (entityIds.length > 0) addConfig(source.table, linkingVar, entityIds);
    }
  }

  // Image placeholders — source_table + linking_variable live directly
  // on the placeholder (not via master field sources).
  for (const p of placeholders) {
    if (p.type === 'image' && p.source_table && p.linking_variable) {
      if (entityIds.length > 0) addConfig(p.source_table, p.linking_variable, entityIds);
    }

    // Document-checklist placeholders — each checklist_data_source
    // references its own table + linking_variable.
    if (p.type === 'document_checklist' && p.checklist_data_sources?.length) {
      for (const ds of p.checklist_data_sources) {
        if (ds.table && ds.linking_variable) {
          if (entityIds.length > 0) addConfig(ds.table, ds.linking_variable, entityIds);
        }
      }
    }
  }

  return tableConfigs;
}

// ---------------------------------------------------------------------------
// Data fetching
// ---------------------------------------------------------------------------

export interface EcDataResult {
  combinedCache: Record<string, Record<string, any>>;
  masterFields: Map<number, JobField>;
}

export async function fetchEcData(
  ecPlaceholders: EcPlaceholder[],
  individualId: number | null | undefined,
  companyId: number | string | null | undefined,
): Promise<EcDataResult> {
  const empty: EcDataResult = { combinedCache: {}, masterFields: new Map() };

  // Only master_field kind placeholders need fetch + resolve
  const linked = ecPlaceholders.filter((p) => p.source_kind === 'master_field');
  if (linked.length === 0) return empty;

  // Convert to DTM format for shared processing
  const dtmPlaceholders = linked.map(ecPlaceholderToDtmPlaceholder);

  // Collect all master field IDs
  const allFieldIds = new Set<number>();
  for (const p of dtmPlaceholders) {
    collectPlaceholderMasterFieldIds(p).forEach((id) => allFieldIds.add(id));
  }
  if (allFieldIds.size === 0) return empty;

  // Fetch master fields from tm_job_fields
  const { data: fieldRows, error: fieldsError } = await supabase
    .from('tm_job_fields')
    .select('*')
    .in('id', Array.from(allFieldIds));
  if (fieldsError || !fieldRows) return empty;

  const masterFields = new Map<number, JobField>(
    fieldRows.map((f: any) => [f.id, f as JobField]),
  );

  // Build table configs and fetch table data
  const entityIds = [individualId, companyId].filter(Boolean) as (string | number)[];
  const tableConfigs = collectTableConfigs(dtmPlaceholders, entityIds, masterFields);
  if (tableConfigs.size === 0) return { combinedCache: {}, masterFields };

  const combinedCache: Record<string, Record<string, any>> = {};
  await Promise.all(
    Array.from(tableConfigs.entries()).map(async ([table, byLinkingVar]) => {
      const linkingVars = Array.from(byLinkingVar.keys());
      let query = supabase.from(table).select('*');

      if (linkingVars.length === 1) {
        const ids = Array.from(byLinkingVar.get(linkingVars[0])!);
        query =
          ids.length === 1
            ? query.eq(linkingVars[0], ids[0])
            : query.in(linkingVars[0], ids as any);
      } else {
        const orExpr = linkingVars
          .map((lv) => {
            const ids = Array.from(byLinkingVar.get(lv)!);
            return ids.length === 1
              ? `${lv}.eq.${ids[0]}`
              : `${lv}.in.(${ids.join(',')})`;
          })
          .join(',');
        query = query.or(orExpr);
      }

      const { data, error } = await query;
      if (error || !data) return;

      const rowsByKey: Record<string, any> = {};
      data.forEach((row: any, idx: number) => {
        rowsByKey[row.id ?? idx] = row;
      });
      combinedCache[table] = rowsByKey;
    }),
  );

  return { combinedCache, masterFields };
}

// ---------------------------------------------------------------------------
// Resolution (uses shared processPlaceholderValue)
// ---------------------------------------------------------------------------

export function resolveEcPlaceholders(
  ecPlaceholders: EcPlaceholder[],
  individualId: number | null | undefined,
  companyId: number | string | null | undefined,
  combinedCache: Record<string, Record<string, any>>,
  masterFields: Map<number, JobField>,
): Record<string, string> {
  const linked = ecPlaceholders.filter((p) => p.source_kind === 'master_field');
  if (linked.length === 0) return {};

  // Convert to DTM format
  const dtmPlaceholders = linked.map(ecPlaceholderToDtmPlaceholder);

  const result: Record<string, string> = {};

  for (const p of dtmPlaceholders) {
    const entityType = Array.isArray(p.entity_type) ? p.entity_type[0] : p.entity_type;
    const isCompany = entityType?.toLowerCase() === 'company';

    // Build relationshipData so processPlaceholderValue → getTargetEntity
    // returns the right entity for this placeholder's scope.
    const relationshipData = {
      company: isCompany && companyId
        ? { id: String(companyId), company_id: String(companyId) }
        : null,
      directors: [],
      dependants: [],
      understudy: null,
      sponsor: null,
      principal: null,
    };

    // For individual-scoped placeholders, pass the employee so
    // getTargetEntity's company-registry fallback can find it.
    const companyAssociates =
      !isCompany && individualId
        ? [{ id: individualId, associations: [{ individual_type: entityType || 'individual' }] }]
        : null;

    // entityIdMap lets getTargetEntity's task-participant path find the individual
    const entityIdMap =
      !isCompany && individualId
        ? { [entityType || 'individual']: individualId }
        : null;

    const { value } = processPlaceholderValue(
      p,
      relationshipData,
      combinedCache,
      masterFields,
      entityIdMap,
      null,
      companyId ? { id: String(companyId) } : null,
      null,
      null,
      null,
      null,
      companyAssociates,
      null,
    );

    if (value !== undefined && value !== null && String(value).trim() !== '') {
      result[p.name] = String(value);
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Single-placeholder resolve (for MasterFieldEditControl's edit preview)
// ---------------------------------------------------------------------------

export async function resolveEcPlaceholderSingle(
  placeholder: EcPlaceholder,
  individualId: number | null | undefined,
  companyId: number | string | null | undefined,
): Promise<Record<string, string>> {
  const { combinedCache, masterFields } = await fetchEcData([placeholder], individualId, companyId);
  return resolveEcPlaceholders([placeholder], individualId, companyId, combinedCache, masterFields);
}

// ---------------------------------------------------------------------------
// Entity scope helpers (EC-specific, kept for MasterFieldEditControl)
// ---------------------------------------------------------------------------

export type EntityScope = 'company' | 'individual' | 'either';

export function resolveEntityScope(entityType: string[] | string | undefined | null): EntityScope {
  const types = Array.isArray(entityType) ? entityType : (entityType ? [entityType] : []);
  const wantsCompany = types.includes('company');
  const wantsIndividual = types.some((t) => t !== 'company');
  if (wantsCompany && wantsIndividual) return 'either';
  if (wantsCompany) return 'company';
  if (wantsIndividual) return 'individual';
  return 'either';
}

// ---------------------------------------------------------------------------
// Save to source record (EC-specific)
// ---------------------------------------------------------------------------

export async function saveEcMasterFieldValue(
  masterFieldId: number,
  masterFields: Map<number, JobField>,
  newValue: string,
  individualId: number | null | undefined,
  companyId: number | string | null | undefined,
  entityType?: string[] | string | null
): Promise<{ success: boolean; error?: string }> {
  const mf = masterFields.get(masterFieldId);
  if (!mf?.sources?.length) return { success: false, error: 'Master field configuration missing' };

  const sources = mf.sources as JobFieldSource[];
  const companySource = sources.find((s) => s.source_type === 'company');
  const individualSource = sources.find((s) => s.source_type === 'individual');
  const scope = resolveEntityScope(entityType);

  const source = scope === 'company'
    ? companySource
    : scope === 'individual'
    ? individualSource
    : (companyId != null && companySource) || (individualId != null && individualSource) || pickMasterFieldSource(sources, 'individual');

  if (!source) {
    const wanted = scope === 'company' ? 'company' : scope === 'individual' ? 'employee' : 'matching';
    return { success: false, error: `This field has no ${wanted} source configured` };
  }

  const linkingVar = (source.linking_variable as string | null | undefined) || 'id';
  const entityId = linkingVar === 'company_id'
    ? companyId
    : linkingVar === 'individual_id'
    ? individualId
    : (source.source_type === 'company' ? companyId : individualId);

  if (entityId == null) {
    return { success: false, error: `No ${source.source_type === 'company' ? 'company' : 'employee'} record to save this value against` };
  }

  return writeMasterFieldSourceValue(
    { table: source.table, path: source.path, linkVar: linkingVar, entityId },
    newValue
  );
}

// ---------------------------------------------------------------------------
// Backward-compatible wrapper (matches old masterFieldResolver API)
// ---------------------------------------------------------------------------

export interface ResolveEcPlaceholderValuesResult {
  values: Record<string, string>;
  masterFields: Map<number, JobField>;
}

export async function resolveEcPlaceholderValues(
  ecPlaceholders: EcPlaceholder[],
  individualId: number | null | undefined,
  companyId: number | string | null | undefined,
): Promise<ResolveEcPlaceholderValuesResult> {
  const { combinedCache, masterFields } = await fetchEcData(ecPlaceholders, individualId, companyId);
  const values = resolveEcPlaceholders(ecPlaceholders, individualId, companyId, combinedCache, masterFields);
  return { values, masterFields };
}
