import supabase from '@/lib/supabase/client';
import { processTextField, processCurrentDateField, writeMasterFieldSourceValue, pickMasterFieldSource } from '../../master-fields/utils/masterFieldValueResolver';
import { processConditionalField, processBooleanField } from '../../tasks-requirements/utils/placeholderProcessors';
import type { EcPlaceholder } from './ecPlaceholders';
import type { JobField, JobFieldSource } from '../../master-fields/components/types/database';

// Every master field id an EC placeholder references, wherever it's actually
// stored - master_field_id/master_field_links for plain 'text' placeholders,
// or scattered across conditions[]/boolean_conditions[] for 'conditional'/
// 'boolean' ones (a condition's own master_field_id, or nested inside its
// comparison/additional_comparisons for the gender/marital-status style).
// Used both to decide whether a placeholder is "linked" at all and to know
// which master fields' source tables need fetching - missing any of these
// spots is exactly the bug that made tasks-requirements' own conditional
// placeholders silently resolve blank before this session's fixes to
// templateGenerationData.ts / TemplateGenerationDialog.tsx.
function collectPlaceholderMasterFieldIds(p: EcPlaceholder): number[] {
  const ids = new Set<number>();
  if (p.master_field_id) ids.add(Number(p.master_field_id));
  (p.master_field_links || []).forEach((l) => ids.add(Number(l.master_field_id)));
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

// Resolves an image-type placeholder to a public Supabase storage URL by
// walking the master field's configured sources (KYC upload tables with
// file_path columns).  Same logic as TemplateGenerationDialog's
// processImageField — looks up each master_field_id's sources, filters by
// entity ID and optional document_type_ids, sorts by issue_date desc
// (latest first), and constructs the public storage URL.
function processImageField(
  p: EcPlaceholder,
  targetEntity: Record<string, any>,
  combinedCache: Record<string, Record<string, any>>,
  masterFields: Map<number, JobField>
): { value: string; source: string | null } {
  const masterFieldIds = p.master_field_links?.length
    ? p.master_field_links.map((l) => Number(l.master_field_id))
    : p.master_field_id
    ? [Number(p.master_field_id)]
    : [];

  if (masterFieldIds.length === 0) return { value: '', source: null };

  const candidateIds = [
    targetEntity?.id,
    targetEntity?.director_id,
    targetEntity?.individual_id,
    targetEntity?.company_id,
  ]
    .filter(Boolean)
    .map(String)
    .filter((v, i, arr) => arr.indexOf(v) === i);

  if (candidateIds.length === 0) return { value: '', source: null };

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';

  for (const mid of masterFieldIds) {
    const mf = masterFields.get(mid);
    if (!mf?.sources) continue;

    const sortedSources = [...mf.sources].sort(
      (a: any, b: any) => (a.priority ?? 999) - (b.priority ?? 999)
    );

    for (const source of sortedSources as any[]) {
      const tableData = combinedCache[source.table];
      if (!tableData) continue;

      const linkingVar = source.linking_variable || 'id';
      const docIds: string[] = Array.isArray(source.document_id)
        ? source.document_id
        : source.document_id
        ? [source.document_id]
        : [];

      let matches = Object.values(tableData).filter((r: any) => {
        if (!candidateIds.includes(String(r[linkingVar]))) return false;
        if (docIds.length > 0) return docIds.includes(r.document_id);
        return true;
      });

      if (matches.length === 0) continue;

      matches = matches.sort((a: any, b: any) => {
        const aDate = a.issue_date
          ? new Date(a.issue_date).getTime()
          : a.created_at
          ? new Date(a.created_at).getTime()
          : 0;
        const bDate = b.issue_date
          ? new Date(b.issue_date).getTime()
          : b.created_at
          ? new Date(b.created_at).getTime()
          : 0;
        return bDate - aDate;
      });

      const match: any = matches[0];
      if (match?.file_path) {
        return {
          value: `${supabaseUrl}/storage/v1/object/public/kyc-documents/${match.file_path}`,
          source: `Image: ${source.table}`,
        };
      }
    }
  }

  return { value: '', source: null };
}

// Resolves every ec_placeholders row linked to a master field
// (source_kind === 'master_field') for one employee/company pair, using the
// same core table/path/priority resolver Document Template Manager uses
// (see master-fields/utils/masterFieldValueResolver.ts) instead of a second,
// EC-only re-implementation of that walk. 'individual', 'company', and
// 'document' sources are all meaningful here - master fields shared with DTM
// (e.g. Kenyan ID/passport, sourced from acc_portal_directors_documents) can
// carry a 'document' source_type, keyed the same way DTM keys it: by
// director_id, which for an individual is just their registry_individuals id.
//
// Unlike the old per-field-per-source Supabase query this replaces, this
// bulk-fetches each distinct table referenced by the linked master fields
// once (matching DTM's own fetch-the-table-then-resolve-in-memory shape),
// then hands the resulting cache to processTextField per placeholder.
//
// Also returns the fetched masterFields Map itself (not just the resolved
// values) - useMasterFieldValues.ts exposes this to ContractEditor.tsx's
// edit-and-save-to-source UI, which needs each linked field's own `sources`/
// `type`/`options` to build its multi-source popover and select-aware edit
// control, without a second duplicate tm_job_fields fetch.
export interface ResolveEcPlaceholderValuesResult {
  values: Record<string, string>;
  masterFields: Map<number, JobField>;
}

// A placeholder's own entity_type is the single source of truth for which
// entity it's allowed to read from or write to - EC only ever has one
// employee and one company in scope, so 'company' means the company and
// anything else (employee, or any other tag someone puts on entity_type)
// means the employee. Without this, a field shared by two placeholders
// (e.g. master field 56 with both a company-KRA-PIN and an employee-KRA-PIN
// source) resolves/saves against whichever source happens to be checked
// first - which in practice is almost always the company one, since
// companyId is present on every contract. entity_type tagging BOTH (or
// neither) falls back to 'either', preserving that old any-source-wins
// behavior for placeholders that genuinely don't care.
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

export async function resolveEcPlaceholderValues(
  ecPlaceholders: EcPlaceholder[],
  individualId: number | null | undefined,
  companyId: number | string | null | undefined
): Promise<ResolveEcPlaceholderValuesResult> {
  const empty = { values: {}, masterFields: new Map<number, JobField>() };
  const linked = ecPlaceholders.filter(
    (p) => p.source_kind === 'master_field' && collectPlaceholderMasterFieldIds(p).length > 0
  );
  if (linked.length === 0) return empty;

  // Gather every referenced master field id up front so the table-fetch pass
  // below can run once for the whole batch - final per-placeholder
  // resolution (which respects each link's own strategy) happens later.
  const allFieldIds = new Set<number>();
  for (const p of linked) {
    collectPlaceholderMasterFieldIds(p).forEach((id) => allFieldIds.add(id));
  }
  if (allFieldIds.size === 0) return empty;

  const { data: fieldRows, error: fieldsError } = await supabase
    .from('tm_job_fields')
    .select('*')
    .in('id', Array.from(allFieldIds));
  if (fieldsError || !fieldRows) return empty;

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
      if (source.source_type !== 'individual' && source.source_type !== 'company' && source.source_type !== 'document') continue;
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

  // Resolve one master field id at a time (not the whole list at once) so
  // each link's own strategy can be honored: 'fallback' stops at the first
  // link that resolves a non-empty value (the common case - e.g. try the
  // Employee record, only fall back to a secondary source if blank);
  // 'merge' keeps going and concatenates every non-empty link's value.
  // processTextField itself has no concept of strategy (it always merges
  // whatever ids it's given), so that per-link decision has to live here.
  const result: Record<string, string> = {};
  for (const p of linked) {
    // Scoped per-placeholder, not shared - a field linked to both a
    // company-scoped and an employee-scoped placeholder (e.g. KRA PIN) must
    // resolve each independently, never letting one borrow the other's value.
    const scope = resolveEntityScope(p.entity_type);
    const scopedTargetEntity = scope === 'company'
      ? { company_id: companyId ?? undefined }
      : scope === 'individual'
      ? { individual_id: individualId ?? undefined }
      : { individual_id: individualId ?? undefined, company_id: companyId ?? undefined };

    // Conditional/boolean placeholders skip the plain master_field_links
    // fallback chain below entirely - processConditionalField/
    // processBooleanField (the SAME functions tasks-requirements' own
    // document templates use, already hardened this session) walk
    // p.conditions/p.boolean_conditions directly instead.
    if (p.type === 'conditional' && (p.conditions?.length ?? 0) > 0) {
      const { value } = processConditionalField(p, scopedTargetEntity, combinedCache, masterFields, null);
      if (value) result[p.key] = String(value);
      continue;
    }

    if (p.type === 'boolean' && (p.boolean_conditions?.length ?? 0) > 0) {
      const { value: results } = processBooleanField(p, scopedTargetEntity, combinedCache, masterFields, null);
      const checkedLabels: string[] = [];
      for (const r of (results as any[]) || []) {
        if (r?.tag) result[r.tag] = r.checked ? (r.label || '') : '';
        if (r?.checked && r.label) checkedLabels.push(r.label);
      }
      if (checkedLabels.length > 0) result[p.key] = checkedLabels.join(', ');
      continue;
    }

    // Image placeholders resolve to a public Supabase storage URL by
    // walking the master field's configured sources (typically KYC upload
    // tables with file_path columns) — same logic as TGD's processImageField.
    if (p.type === 'image') {
      const { value } = processImageField(p, scopedTargetEntity, combinedCache, masterFields);
      if (value) result[p.key] = value;
      continue;
    }

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
        : processTextField([id], scopedTargetEntity, combinedCache, masterFields, null);
      if (!value) continue;
      collected.push(value);
      if (link.strategy !== 'merge') break;
    }
    if (collected.length > 0) result[p.key] = collected.join(' ');
  }
  return { values: result, masterFields };
}

// Picks which of a master field's own sources to write to. Must be scoped by
// the EDITING PLACEHOLDER's own entity_type, not just "whichever id happens
// to be available" - companyId is present on essentially every contract, so
// the old id-availability check always preferred the company source, even
// when the user was editing an employee-scoped placeholder (e.g.
// employee_kra_pin) that shares a master field with a company-scoped one
// (company_kra_pin). That silently wrote personal edits into the company's
// record. entityType (the placeholder's own entity_type) makes the choice
// deliberate instead of incidental. Falls back to pickMasterFieldSource's
// "no match -> take the first source" behavior only when entityType is
// absent/ambiguous - the SAME shared function TemplateGenerationDialog.tsx's
// saveFieldToDatabase uses for its own default single-source save path, not
// a second reimplementation of that matching logic. Then delegates the
// actual write to the shared writeMasterFieldSourceValue core.
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
// Array / block placeholder resolution
// ---------------------------------------------------------------------------
// Consultancy Contracts (and potentially Employment Contracts in the future)
// needs to resolve repeating block placeholders (e.g. one row per director)
// against a list of entities.  Each block is a "parent" placeholder whose
// `is_block_start` flag is true; its children carry `parent_name` pointing
// back to the block.  The caller supplies a `sourceArrays` map keyed by
// entity type (e.g. "director") containing the list of entities to iterate
// over.  Each entity must have at least an `id` field.
//
// This function builds its own combined cache (same pattern as
// resolveEcPlaceholderValues above) covering ALL entities in ALL source
// arrays so the tables are fetched once, then resolves each child
// placeholder per-entity using processTextField.

export interface ResolveEcArrayResult {
  /** Block name → array of row objects, each keyed by child placeholder key */
  arrayValues: Record<string, Record<string, string>[]>;
  masterFields: Map<number, JobField>;
}

export async function resolveEcArrayPlaceholderValues(
  ecPlaceholders: EcPlaceholder[],
  companyId: number | string | null | undefined,
  sourceArrays: Record<string, Array<{ id: string | number; [key: string]: any }>>
): Promise<ResolveEcArrayResult> {
  const empty: ResolveEcArrayResult = { arrayValues: {}, masterFields: new Map() };

  // 1. Build block → children map
  const blockMap = new Map<string, { config: EcPlaceholder; children: EcPlaceholder[] }>();
  for (const p of ecPlaceholders) {
    if (p.is_block_start) {
      blockMap.set(p.key, { config: p, children: [] });
    } else if (p.parent_name && blockMap.has(p.parent_name)) {
      blockMap.get(p.parent_name)!.children.push(p);
    }
  }
  if (blockMap.size === 0) return empty;

  // 2. Collect master field ids from all block children
  const allFieldIds = new Set<number>();
  for (const block of blockMap.values()) {
    for (const child of block.children) {
      collectPlaceholderMasterFieldIds(child).forEach((id) => allFieldIds.add(id));
    }
  }
  if (allFieldIds.size === 0) return empty;

  // 3. Fetch master fields
  const { data: fieldRows, error: fieldsError } = await supabase
    .from('tm_job_fields')
    .select('*')
    .in('id', Array.from(allFieldIds));
  if (fieldsError || !fieldRows) return empty;

  const masterFields = new Map<number, JobField>(
    fieldRows.map((f: any) => [f.id, f as JobField])
  );

  // 4. Build combined cache — same logic as resolveEcPlaceholderValues but
  //    iterating over every entity in every source array instead of a single
  //    individualId.
  const tableConfigs = new Map<string, Map<string, Set<string | number>>>();
  for (const mf of masterFields.values()) {
    for (const source of (mf.sources || []) as JobFieldSource[]) {
      if (
        source.source_type !== 'individual' &&
        source.source_type !== 'company' &&
        source.source_type !== 'document'
      ) continue;
      if (!source.table) continue;

      const linkingVar = (source.linking_variable as string | null | undefined) || 'id';

      if (linkingVar === 'company_id' || source.source_type === 'company') {
        if (companyId == null) continue;
        if (!tableConfigs.has(source.table)) tableConfigs.set(source.table, new Map());
        const byLv = tableConfigs.get(source.table)!;
        if (!byLv.has(linkingVar)) byLv.set(linkingVar, new Set());
        byLv.get(linkingVar)!.add(companyId);
      } else {
        // Individual / document sources — collect ids from every source array
        if (!tableConfigs.has(source.table)) tableConfigs.set(source.table, new Map());
        const byLv = tableConfigs.get(source.table)!;
        if (!byLv.has(linkingVar)) byLv.set(linkingVar, new Set());
        const ids = byLv.get(linkingVar)!;
        for (const entities of Object.values(sourceArrays)) {
          for (const entity of entities) {
            ids.add(entity.id);
          }
        }
      }
    }
  }

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
    })
  );

  // 5. Resolve each block
  const arrayValues: Record<string, Record<string, string>[]> = {};

  for (const [blockName, block] of blockMap) {
    const entityTypeRaw = Array.isArray(block.config.entity_type)
      ? block.config.entity_type[0]
      : block.config.entity_type || 'director';
    const normType = entityTypeRaw.toLowerCase().trim();
    const sourceArray = sourceArrays[normType] || sourceArrays[entityTypeRaw] || [];
    const isPrimaryOnly = block.config.director_type === 'primary';

    if (sourceArray.length === 0) continue;

    const effectiveArray = isPrimaryOnly ? sourceArray.slice(0, 1) : sourceArray;

    const rows = effectiveArray.map((entity) => {
      const rowData: Record<string, string> = {};

      for (const child of block.children) {
        const scope = resolveEntityScope(child.entity_type);
        const targetEntity =
          scope === 'company'
            ? { company_id: companyId ?? undefined }
            : { id: entity.id };

        // Handle conditional / boolean children
        if (child.type === 'conditional' && (child.conditions?.length ?? 0) > 0) {
          const { value } = processConditionalField(
            child,
            targetEntity,
            combinedCache,
            masterFields,
            null
          );
          rowData[child.key] = value ? String(value) : '';
          continue;
        }

        if (child.type === 'boolean' && (child.boolean_conditions?.length ?? 0) > 0) {
          const { value: results } = processBooleanField(
            child,
            targetEntity,
            combinedCache,
            masterFields,
            null
          );
          const checkedLabels: string[] = [];
          for (const r of (results as any[]) || []) {
            if (r?.checked && r.label) checkedLabels.push(r.label);
          }
          rowData[child.key] = checkedLabels.join(', ');
          continue;
        }

        // Image children resolve to Supabase storage URLs — same
        // processImageField used by resolveEcPlaceholderValues above.
        if (child.type === 'image') {
          const { value } = processImageField(child, targetEntity, combinedCache, masterFields);
          rowData[child.key] = value || '';
          continue;
        }

        // Standard master_field_links resolution
        const links =
          child.master_field_links && child.master_field_links.length > 0
            ? [...child.master_field_links].sort(
                (a, b) => a.display_priority - b.display_priority
              )
            : child.master_field_id
            ? [{ master_field_id: child.master_field_id, display_priority: 1, strategy: 'fallback' as const }]
            : [];

        const collected: string[] = [];
        for (const link of links) {
          const id = Number(link.master_field_id);
          const mf = masterFields.get(id) as
            | (JobField & { date_config?: { useCurrentDate?: boolean } })
            | undefined;
          const { value } = mf?.date_config?.useCurrentDate
            ? processCurrentDateField([id], masterFields)
            : processTextField([id], targetEntity, combinedCache, masterFields, null);
          if (!value) continue;
          collected.push(value);
          if (link.strategy !== 'merge') break;
        }
        rowData[child.key] = collected.join(' ');
      }

      return rowData;
    });

    arrayValues[blockName] = rows;
  }

  return { arrayValues, masterFields };
}
