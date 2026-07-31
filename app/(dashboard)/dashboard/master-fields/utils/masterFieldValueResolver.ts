// Core "resolve a tm_job_fields value from a pre-fetched table cache" logic,
// extracted out of tasks-requirements/TemplateGenerationDialog.tsx so Document
// Template Manager and other consumers (Employment Contracts) share one
// implementation instead of each re-deriving the same table/path/priority
// walk. This is the entity-agnostic core only - DTM's own director/dependant
// targetEntity resolution, computed-field cache population, and bulk
// table-fetching stay in their respective callers, since those parts are
// genuinely caller-shaped (DTM's task/relationship graph vs EC's single
// employee+company pair).
//
// tm_job_fields.id is numeric (confirmed via the "ids arrive as numbers"
// normalization comment in employment-contracts/components/PlaceholderSources.tsx)
// despite JobField['id'] being typed as string in
// master-fields/components/types/database.ts - that type is stale, matching
// the already-known staleness of JobFieldSource['linking_variable'] in the
// same file (a third field, date_config - see processCurrentDateField below -
// is ALSO missing from that type despite being a real, actively-used column
// managed by master-fields/components/dialogs/field-dialog.tsx). Do not "fix"
// the parseInt(id, 10) calls below to treat ids as opaque strings without
// re-confirming the numeric-id claim first.

export const formatDate = (date: Date | string | null | undefined, formatStr?: string): string => {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();

  if (!formatStr) return `${year}-${month}-${day}`;

  return formatStr
    .replace('YYYY', String(year))
    .replace('MM', month)
    .replace('DD', day);
};

/**
 * A master field can be configured as a "system date" field
 * (tm_job_fields.date_config.useCurrentDate) instead of a DB-sourced one -
 * it resolves to today's date directly, no table/path lookup, no target
 * entity needed at all. Checked ahead of processTextField for any id that
 * has it set; ids without date_config fall through untouched.
 */
export function processCurrentDateField(
  masterFieldIds: Array<string | number> | undefined,
  masterFields: Map<number, any>
): ResolvedFieldValue {
  if (!masterFieldIds?.length) return { value: '', source: null };

  for (const id of masterFieldIds) {
    const mf = masterFields.get(parseInt(String(id), 10));
    if (mf?.date_config?.useCurrentDate) {
      return {
        value: formatDate(new Date(), mf.date_config.format || 'DD/MM/YYYY'),
        source: 'System Date',
      };
    }
  }

  return { value: '', source: null };
}

export const parseJsonValue = (data: any, path: string): string => {
  if (!path || !data) return '';
  try {
    let currentValue = data;
    const normalizedPath = path.replace(/->>/g, '->').replace(/'/g, '');
    const parts = normalizedPath.split(/->|\./);

    for (let i = 0; i < parts.length; i++) {
      const key = parts[i].trim();
      if (!key) continue;
      if (currentValue && currentValue.current !== undefined && key === 'current') {
        currentValue = currentValue.current;
      }

      if (Array.isArray(currentValue)) {
        currentValue = currentValue[0];
      }

      if (currentValue && typeof currentValue === 'object') {
        if (currentValue[key] !== undefined) {
          currentValue = currentValue[key];
        } else {
          const lowerKey = key.toLowerCase();
          const foundKey = Object.keys(currentValue).find((k) => k.toLowerCase() === lowerKey);
          if (foundKey) {
            currentValue = currentValue[foundKey];
          } else {
            currentValue = undefined;
          }
        }
      } else if (i < parts.length - 1) {
        return '';
      }
    }

    return currentValue !== undefined && currentValue !== null ? String(currentValue) : '';
  } catch (error) {
    return '';
  }
};

export interface ResolvedFieldValue {
  value: string;
  source: string | null;
}

/**
 * Given a list of master field ids (in priority/fallback order) and a
 * pre-populated table cache, resolves the text value for whichever field +
 * source combination yields a non-empty value first. Mirrors DTM's own
 * multi-id behavior: every id in the list is attempted (not just the first
 * that succeeds) and all non-empty results are space-joined - this is the
 * existing "merge" semantics DTM's callers already rely on, not something
 * changed here.
 *
 * @param masterFieldIds - tm_job_fields ids to try, in order.
 * @param targetEntity - object exposing whichever of id/director_id/
 *   individual_id/company_id the source's linking_variable expects.
 * @param combinedCache - Record<table, Record<anyKey, row>> - the caller is
 *   responsible for fetching these rows ahead of time (this function only
 *   scans what's already in memory, it never queries the DB itself).
 * @param masterFields - Map<number, JobField> keyed by numeric tm_job_fields.id.
 * @param computedFieldCache - only consulted for sources with is_computed set;
 *   pass null/undefined for callers that never resolve computed fields.
 */
export function processTextField(
  masterFieldIds: Array<string | number> | undefined,
  targetEntity: any,
  combinedCache: Record<string, any>,
  masterFields: Map<number, any>,
  computedFieldCache: Record<string, any> | null = null
): ResolvedFieldValue {
  if (!masterFieldIds?.length) {
    return { value: '', source: null };
  }

  const candidateIds = [
    targetEntity?.id,
    targetEntity?.director_id,
    targetEntity?.individual_id,
    targetEntity?.company_id,
  ]
    .filter(Boolean)
    .map(String)
    .filter((v, i, arr) => arr.indexOf(v) === i);

  if (candidateIds.length === 0) {
    return { value: '', source: null };
  }

  const allValues: string[] = [];
  const allSources: string[] = [];

  for (const id of masterFieldIds) {
    const mf = masterFields.get(parseInt(String(id), 10));
    if (!mf?.sources) continue;

    // Sort by priority ascending so lower number = higher priority
    const sortedSources = [...mf.sources].sort(
      (a: any, b: any) => (a.priority ?? 999) - (b.priority ?? 999)
    );

    for (const source of sortedSources as any[]) {
      // ── COMPUTED SOURCE ──────────────────────────────────────────────
      if (source.is_computed) {
        if (!computedFieldCache) continue;

        const extractionMode = 'latest';
        let computedVal: any;

        for (const candidateId of candidateIds) {
          const ck = `${mf.id}_${candidateId}_${extractionMode}`;
          if (computedFieldCache[ck] !== undefined) {
            computedVal = computedFieldCache[ck];
            break;
          }
        }

        if (computedVal === undefined) continue; // still loading

        const errorStrings = [
          'Document Not Found', 'Missing Document', 'No Document Specified',
          'Field Not Found', 'Number Not Found', 'Missing', 'No Source',
        ];

        if (computedVal !== null && !errorStrings.includes(computedVal)) {
          let finalVal = computedVal;

          if (typeof computedVal === 'object' && computedVal !== null && source.path) {
            const pathMatch = source.path.match(/['"]([\w_]+)['"]$/);
            const fieldName = pathMatch ? pathMatch[1] : null;
            if (fieldName && computedVal[fieldName]) {
              finalVal = String(computedVal[fieldName]);
            } else {
              finalVal = computedVal.en || computedVal.name || computedVal.title ||
                String(Object.values(computedVal)[0] || '');
            }
          }

          if (finalVal && String(finalVal).trim() !== '') {
            allValues.push(String(finalVal));
            allSources.push(`Computed: ${mf.label || source.table}`);
            break; // found for this master field — stop trying sources
          }
        }
        continue; // computed error → try next priority source
      }

      // ── STANDARD DB SOURCE ───────────────────────────────────────────
      const tableData = combinedCache[source.table];
      if (!tableData) continue;

      const linkingVar = source.linking_variable || 'id';

      // Document-scoped sources (source_type === 'document' or has document_id[])
      // are cached under a composite key: doc_<docId>_<entityId>
      const docIds: string[] = Array.isArray(source.document_id)
        ? source.document_id
        : (source.document_id ? [source.document_id] : []);

      let record: any = null;

      if (docIds.length > 0) {
        // Try composite key first: doc_<documentId>_<entityId>
        for (const docId of docIds) {
          for (const candidateId of candidateIds) {
            const compositeKey = `doc_${docId}_${candidateId}`;
            if (tableData[compositeKey]) {
              record = tableData[compositeKey];
              break;
            }
          }
          if (record) break;
        }

        // Fallback: scan table rows matching both entity ID and document_id
        if (!record) {
          const allRows = Object.values(tableData);
          for (const candidateId of candidateIds) {
            record = allRows.find((r: any) =>
              String(r[linkingVar]) === candidateId &&
              docIds.includes(r.document_id)
            ) || null;
            if (record) break;
          }
        }
      } else {
        // Standard entity-ID lookup
        for (const candidateId of candidateIds) {
          record = Object.values(tableData).find((r: any) =>
            String((r as any)[linkingVar]) === candidateId
          ) || null;
          if (record) break;
        }
      }

      if (record) {
        // source.path is required on JobFieldSource in practice - this
        // fallback only guards a source row saved without one.
        let val = source.path
          ? parseJsonValue(record, source.path)
          : (record as any)[mf.field_key];

        if (val && String(val).trim() !== '') {
          allValues.push(String(val));
          allSources.push(`DB(p${source.priority ?? '?'}): ${source.table}`);
          break; // found a value at this priority — stop trying lower priorities
        }
        // value was empty → fall through to next priority source
      }
      // record not found → fall through to next priority source
    }
  }

  if (allValues.length > 0) {
    return { value: allValues.join(' '), source: allSources[0] };
  }

  return { value: '', source: null };
}
