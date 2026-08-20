// @ts-nocheck
import supabase from '@/lib/supabase/client';
import { processPlaceholderValue } from '../../tasks-requirements/utils/placeholderProcessors';
import type { Placeholder } from '../../templates/document-template-manager/types';
import type { JobField } from '../../master-fields/components/types/database';

export function resolveCompanyRole(p: { key: string; company_role?: 'client' | 'consultant' | null }): 'client' | 'consultant' {
  if (p.company_role === 'consultant' || p.company_role === 'client') return p.company_role;
  return p.key.startsWith('consultant_') ? 'consultant' : 'client';
}

export function inferGroupLabel(p: { key: string; company_role?: 'client' | 'consultant' | null }): string {
  if (p.company_role === 'consultant') return 'Consultant';
  if (p.company_role === 'client') return 'Client';
  if (p.key.startsWith('consultant_')) return 'Consultant';
  if (p.key.startsWith('client_') || p.key.startsWith('company_')) return 'Client';
  return 'Contract Details';
}

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

export interface CcDataResult {
  combinedCache: Record<string, Record<string, any>>;
  masterFields: Map<number, JobField>;
}

export async function fetchCcData(
  placeholders: Placeholder[],
  entityIds: (string | number)[],
): Promise<CcDataResult> {
  const allFieldIds = new Set<number>();
  for (const p of placeholders) {
    collectPlaceholderMasterFieldIds(p).forEach((id) => allFieldIds.add(id));
  }
  if (allFieldIds.size === 0) return { combinedCache: {}, masterFields: new Map() };

  const { data: fieldRows, error: fieldsError } = await supabase
    .from('tm_job_fields')
    .select('*')
    .in('id', Array.from(allFieldIds));
  if (fieldsError || !fieldRows) return { combinedCache: {}, masterFields: new Map() };

  const masterFields = new Map<number, JobField>(fieldRows.map((f: any) => [f.id, f as JobField]));

  const tableConfigs = new Map<string, Map<string, Set<string | number>>>();
  for (const mf of masterFields.values()) {
    for (const source of (mf.sources || []) as any[]) {
      if (!['individual', 'company', 'document'].includes(source.source_type)) continue;
      if (!source.table) continue;

      const linkingVar = (source.linking_variable as string) || 'id';
      if (entityIds.length === 0) continue;

      if (!tableConfigs.has(source.table)) tableConfigs.set(source.table, new Map());
      const byLv = tableConfigs.get(source.table)!;
      if (!byLv.has(linkingVar)) byLv.set(linkingVar, new Set());
      const set = byLv.get(linkingVar)!;
      for (const id of entityIds) set.add(id);
    }
  }

  const combinedCache: Record<string, Record<string, any>> = {};
  await Promise.all(
    Array.from(tableConfigs.entries()).map(async ([table, byLinkingVar]) => {
      const linkingVars = Array.from(byLinkingVar.keys());
      let query = supabase.from(table).select('*');

      if (linkingVars.length === 1) {
        const ids = Array.from(byLinkingVar.get(linkingVars[0])!);
        query = ids.length === 1 ? query.eq(linkingVars[0], ids[0]) : query.in(linkingVars[0], ids as any);
      } else {
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

      const rowsByKey: Record<string, any> = {};
      data.forEach((row: any, idx: number) => { rowsByKey[row.id ?? idx] = row; });
      combinedCache[table] = rowsByKey;
    }),
  );

  return { combinedCache, masterFields };
}

export function resolveCcPlaceholders(
  placeholders: Placeholder[],
  relationshipData: any,
  combinedCache: Record<string, any>,
  masterFields: Map<number, JobField>,
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const p of placeholders) {
    if (p.is_block_start) continue;
    const { value } = processPlaceholderValue(
      p, relationshipData, combinedCache, masterFields,
      null, null, relationshipData?.company, null, null, null, null,
    );
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      result[p.name] = String(value);
    }
  }
  return result;
}

export function resolveCcBlockPlaceholders(
  blockPlaceholders: Placeholder[],
  sourceArrays: Record<string, Array<{ id: string | number; [key: string]: any }>>,
  combinedCache: Record<string, any>,
  masterFields: Map<number, JobField>,
): Record<string, Record<string, string>[]> {
  const blockMap = new Map<string, { config: Placeholder; children: Placeholder[] }>();
  for (const p of blockPlaceholders) {
    if (p.is_block_start) {
      blockMap.set(p.name, { config: p, children: [] });
    } else if (p.parent_name && blockMap.has(p.parent_name)) {
      blockMap.get(p.parent_name)!.children.push(p);
    }
  }
  if (blockMap.size === 0) return {};

  const arrayValues: Record<string, Record<string, string>[]> = {};
  for (const [blockName, block] of blockMap) {
    const entityTypeRaw = Array.isArray(block.config.entity_type)
      ? block.config.entity_type[0]
      : block.config.entity_type || 'director';
    const normType = entityTypeRaw.toLowerCase().trim();
    const sourceArray = sourceArrays[normType] || sourceArrays[entityTypeRaw] || [];
    const isPrimaryOnly = block.config.director_type === 'primary';

    const effectiveArray = isPrimaryOnly && sourceArray.length > 0 ? sourceArray.slice(0, 1) : sourceArray;
    if (effectiveArray.length === 0) continue;

    const rows = effectiveArray.map((entity, idx) => {
      const rowData: Record<string, string> = {};
      for (const child of block.children) {
        const childEntityType = Array.isArray(child.entity_type) ? child.entity_type[0] : child.entity_type;
        const isCompany = childEntityType?.toLowerCase() === 'company';
        const relationshipData = isCompany
          ? { company: entity }
          : { company: null, directors: [entity] };

        const { value } = processPlaceholderValue(
          child, relationshipData, combinedCache, masterFields,
          null, null, null, idx, effectiveArray, null, null,
        );
        rowData[child.name] = value !== undefined && value !== null ? String(value) : '';
      }
      return rowData;
    });

    arrayValues[blockName] = rows;
  }

  return arrayValues;
}
