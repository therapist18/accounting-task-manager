// Thin wrapper around Employment Contracts' ecResolver - all the actual
// table-fetching/priority-fallback/write-back logic lives there and in
// master-fields/utils/masterFieldValueResolver.ts, shared rather than
// reimplemented (same pattern matrimonial-biodata/utils/biodataResolver.ts
// already uses). CV Generator has no company in scope at all - only
// individualId (the Registry individual linked to this CV) ever matters.
import type { EcPlaceholder } from "../../employment-contracts/utils/ecPlaceholders";
import { fetchEcData, resolveEcPlaceholders, saveEcMasterFieldValue } from "../../employment-contracts/utils/ecResolver";
import type { JobField } from "../../master-fields/components/types/database";
import { CV_MASTER_FIELD_VARIABLES, fetchCvFieldLinks, type CvFieldLink } from "./cvFieldLinks";
import { cvFieldLinkToEcPlaceholder } from "./cvPlaceholderAdapter";

export interface ResolveCvMasterFieldValuesResult {
  values: Record<string, string>;
  masterFields: Map<number, JobField>;
  ecPlaceholders: EcPlaceholder[];
}

async function buildCvPlaceholders(): Promise<EcPlaceholder[]> {
  const links = await fetchCvFieldLinks();
  const byKey = new Map<string, CvFieldLink>(links.map((l) => [l.field_key, l]));
  return CV_MASTER_FIELD_VARIABLES.map((variable) => cvFieldLinkToEcPlaceholder(variable, byKey.get(variable.key)));
}

export async function resolveCvMasterFieldValues(
  individualId: number | string | null | undefined
): Promise<ResolveCvMasterFieldValuesResult> {
  const ecPlaceholders = await buildCvPlaceholders();
  if (individualId == null) {
    return { values: {}, masterFields: new Map(), ecPlaceholders };
  }
  const numId = Number(individualId);
  const { combinedCache, masterFields } = await fetchEcData(ecPlaceholders, numId, null);
  const values = resolveEcPlaceholders(ecPlaceholders, numId, null, combinedCache, masterFields);
  return { values, masterFields, ecPlaceholders };
}

export async function saveCvMasterFieldValue(
  masterFieldId: number,
  masterFields: Map<number, JobField>,
  newValue: string,
  individualId: number | string | null | undefined
): Promise<{ success: boolean; error?: string }> {
  if (individualId == null) return { success: false, error: "No linked Registry individual to save this value against" };
  return saveEcMasterFieldValue(masterFieldId, masterFields, newValue, Number(individualId), null, ["individual"]);
}
