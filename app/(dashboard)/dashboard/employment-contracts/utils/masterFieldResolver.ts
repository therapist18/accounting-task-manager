import supabase from '@/lib/supabase/client';
import { processTextField, processCurrentDateField } from '../../master-fields/utils/masterFieldValueResolver';
import { ecPlaceholderToDtmPlaceholder } from './ecPlaceholderAdapter';
import type { EcPlaceholder } from './ecPlaceholders';
import type { JobField, JobFieldSource } from '../../master-fields/components/types/database';

// Resolves every ec_placeholders row linked to a master field
// (source_kind === 'master_field') for one employee/company pair, using the
// same core table/path/priority resolver Document Template Manager uses
// (see master-fields/utils/masterFieldValueResolver.ts) instead of a second,
// EC-only re-implementation of that walk. Only entity_type 'individual' and
// 'company' sources are meaningful here - EC has no task, no document
// uploads, no director/dependant graph, so those DTM-only source shapes are
// simply never in a linked field's sources for this module.
//
// Unlike the old per-field-per-source Supabase query this replaces, this
// bulk-fetches each distinct table referenced by the linked master fields
// once (matching DTM's own fetch-the-table-then-resolve-in-memory shape),
// then hands the resulting cache to processTextField per placeholder.
export async function resolveEcPlaceholderValues(
  ecPlaceholders: EcPlaceholder[],
  individualId: number | null | undefined,
  companyId: number | string | null | undefined
): Promise<Record<string, string>> {
  const linked = ecPlaceholders.filter(
    (p) => p.source_kind === 'master_field' && (p.master_field_id || (p.master_field_links?.length ?? 0) > 0)
  );
  if (linked.length === 0) return {};

  // Gather every referenced master field id up front so the table-fetch pass
  // below can run once for the whole batch - final per-placeholder
  // resolution (which respects each link's own strategy) happens later.
  const allFieldIds = new Set<number>();
  for (const p of linked) {
    (ecPlaceholderToDtmPlaceholder(p).master_field_ids || []).forEach((id) => allFieldIds.add(id));
  }
  if (allFieldIds.size === 0) return {};

  const { data: fieldRows, error: fieldsError } = await supabase
    .from('tm_job_fields')
    .select('*')
    .in('id', Array.from(allFieldIds));
  if (fieldsError || !fieldRows) return {};

  const masterFields = new Map<number, JobField>(fieldRows.map((f: any) => [f.id, f as JobField]));

  // Group by each source's OWN linking_variable (defaulting to 'id', same
  // default processTextField itself uses) - NOT a hardcoded individual_id/
  // company_id guess. Tables vary: some have a real individual_id/company_id
  // foreign key column, others (e.g. registry_individuals) are keyed by
  // their own `id` column directly, so blindly filtering both columns 400s
  // with "column ... does not exist" on whichever one isn't real. When
  // linking_variable is 'id' (or unset), the source's own source_type says
  // which id value that primary key actually holds.
  const tableConfigs = new Map<string, Map<string, Set<string | number>>>();
  for (const mf of masterFields.values()) {
    for (const source of (mf.sources || []) as JobFieldSource[]) {
      if (source.source_type !== 'individual' && source.source_type !== 'company') continue;
      if (!source.table) continue;

      // JobFieldSource['linking_variable'] is typed 'id' | 'director_id' | null
      // in master-fields/components/types/database.ts, but the Master Fields
      // admin UI actually also writes 'individual_id' / 'company_id' - that
      // type is stale (same staleness masterFieldResolver.ts always worked
      // around before this rewrite), so read it as a plain string here.
      const linkingVar = (source.linking_variable as string | null | undefined) || 'id';
      const candidateId = linkingVar === 'individual_id'
        ? individualId
        : linkingVar === 'company_id'
        ? companyId
        : (source.source_type === 'company' ? companyId : individualId);
      if (candidateId == null) continue;

      if (!tableConfigs.has(source.table)) tableConfigs.set(source.table, new Map());
      const byLinkingVar = tableConfigs.get(source.table)!;
      if (!byLinkingVar.has(linkingVar)) byLinkingVar.set(linkingVar, new Set());
      byLinkingVar.get(linkingVar)!.add(candidateId);
    }
  }

  const combinedCache: Record<string, Record<string, any>> = {};
  await Promise.all(Array.from(tableConfigs.entries()).map(async ([table, byLinkingVar]) => {
    const linkingVars = Array.from(byLinkingVar.keys());
    let query = supabase.from(table).select('*');

    if (linkingVars.length === 1) {
      const ids = Array.from(byLinkingVar.get(linkingVars[0])!);
      query = ids.length === 1 ? query.eq(linkingVars[0], ids[0]) : query.in(linkingVars[0], ids);
    } else {
      // Different sources on the same table need different linking columns
      // (rare, but DTM's own fetchMissingDataSources handles it the same way).
      const orExpr = linkingVars
        .map((lv) => {
          const ids = Array.from(byLinkingVar.get(lv)!);
          return ids.length === 1 ? `${lv}.eq.${ids[0]}` : `${lv}.in.(${ids.join(',')})`;
        })
        .join(',');
      query = query.or(orExpr);
    }

    const { data, error } = await query;
    if (error || !data) return;

    // processTextField scans Object.values(tableData) and matches on the
    // source's own linking_variable column, so the cache key itself is
    // never read - row.id (or the array index as a last resort) is only
    // there to keep entries distinct.
    const rowsByKey: Record<string, any> = {};
    data.forEach((row: any, idx: number) => { rowsByKey[row.id ?? idx] = row; });
    combinedCache[table] = rowsByKey;
  }));

  const targetEntity = { individual_id: individualId ?? undefined, company_id: companyId ?? undefined };

  // Resolve one master field id at a time (not the whole list at once) so
  // each link's own strategy can be honored: 'fallback' stops at the first
  // link that resolves a non-empty value (the common case - e.g. try the
  // Employee record, only fall back to a secondary source if blank);
  // 'merge' keeps going and concatenates every non-empty link's value.
  // processTextField itself has no concept of strategy (it always merges
  // whatever ids it's given), so that per-link decision has to live here.
  const result: Record<string, string> = {};
  for (const p of linked) {
    const links = p.master_field_links && p.master_field_links.length > 0
      ? [...p.master_field_links].sort((a, b) => a.display_priority - b.display_priority)
      : p.master_field_id
      ? [{ master_field_id: p.master_field_id, display_priority: 1, strategy: 'fallback' as const }]
      : [];

    const collected: string[] = [];
    for (const link of links) {
      const id = Number(link.master_field_id);
      // System-date fields (tm_job_fields.date_config.useCurrentDate) resolve
      // to today's date directly, no table lookup or target entity needed -
      // checked before the normal DB-source path, same as DTM does.
      // date_config is a real tm_job_fields column (see field-dialog.tsx) but
      // missing from the JobField type, same staleness as linking_variable above.
      const mf = masterFields.get(id) as (JobField & { date_config?: { useCurrentDate?: boolean } }) | undefined;
      const { value } = mf?.date_config?.useCurrentDate
        ? processCurrentDateField([id], masterFields)
        : processTextField([id], targetEntity, combinedCache, masterFields, null);
      if (!value) continue;
      collected.push(value);
      if (link.strategy !== 'merge') break;
    }
    if (collected.length > 0) result[p.key] = collected.join(' ');
  }
  return result;
}
