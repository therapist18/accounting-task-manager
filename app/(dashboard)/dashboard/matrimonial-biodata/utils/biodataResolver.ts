import { fetchEcData, resolveEcPlaceholders } from '../../employment-contracts/utils/ecResolver';
import type { Placeholder } from '../../templates/document-template-manager/types';
import type { JobField } from '../../master-fields/components/types/database';
import { biodataPlaceholderToResolverInput } from './biodataPlaceholderAdapter';

export interface ResolveBiodataValuesResult {
  values: Record<string, string>;
  masterFields: Map<number, JobField>;
}

// Thin wrapper around Employment Contracts' ecResolver - all the actual
// table-fetching/priority/fallback logic lives there and in
// master-fields/utils/masterFieldValueResolver.ts, shared rather than
// reimplemented. Biodata has no company in scope, so companyId is always
// null - only individualId (the selected Individual) matters here.
export async function resolveBiodataValues(
  placeholders: Placeholder[],
  individualId: number | string | null | undefined
): Promise<ResolveBiodataValuesResult> {
  if (individualId == null) return { values: {}, masterFields: new Map() };
  const ecShaped = placeholders.map(biodataPlaceholderToResolverInput);
  const numId = Number(individualId);
  const { combinedCache, masterFields } = await fetchEcData(ecShaped, numId, null);
  const values = resolveEcPlaceholders(ecShaped, numId, null, combinedCache, masterFields);
  return { values, masterFields };
}
