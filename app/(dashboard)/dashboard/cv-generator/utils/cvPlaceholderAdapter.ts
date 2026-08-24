// Adapts a CV variable (+ its optional cv_field_links row) into the
// EcPlaceholder shape Employment Contracts' resolver engine expects, so CV
// Generator can reuse fetchEcData/resolveEcPlaceholders/saveEcMasterFieldValue
// directly instead of reimplementing them - mirrors matrimonial-biodata's
// biodataPlaceholderAdapter.ts, but skips its DTM-Placeholder intermediate
// step since CV variables aren't stored as template placeholders anywhere.
import type { EcPlaceholder, MasterFieldLink } from "../../employment-contracts/utils/ecPlaceholders";
import type { CvFieldLink, CvFieldVariable } from "./cvFieldLinks";

export function cvFieldLinkToEcPlaceholder(
  variable: CvFieldVariable,
  link: CvFieldLink | undefined
): EcPlaceholder {
  const masterFieldIds = link?.master_field_ids ?? [];
  const masterFieldLinks: MasterFieldLink[] = masterFieldIds.map((id, index) => ({
    master_field_id: String(id),
    display_priority: index + 1,
    // CV variables are single scalar facts (a name, an email) - always
    // "first non-empty wins", never "concatenate every linked source".
    strategy: "fallback",
  }));

  return {
    id: link?.id ?? `unlinked_${variable.key}`,
    key: variable.key,
    label: variable.label,
    group_label: variable.group,
    source_kind: "master_field",
    master_field_id: masterFieldLinks[0]?.master_field_id ?? null,
    master_field_links: masterFieldLinks,
    // CV Generator is always individual-scoped - never a company.
    entity_type: ["individual"],
    settings_key: null,
    offer_field: null,
    editable: true,
    default_value: null,
    description: null,
    required: false,
    type: "text",
    conditions: [],
    boolean_conditions: [],
    created_at: link?.created_at ?? "",
    updated_at: link?.updated_at ?? "",
  };
}
