import type { Placeholder } from '../../templates/document-template-manager/types';
import type { EcPlaceholder, MasterFieldLink } from '../../employment-contracts/utils/ecPlaceholders';
import { getBiodataSection } from './biodataStructure';

// Matrimonial Biodata stores its placeholders directly on the template row
// (acc_portal_templates.placeholders, a DTM Placeholder[] - see
// biodataConfig.ts), NOT in the ec_placeholders table Employment Contracts
// uses. resolveEcPlaceholderValues (employment-contracts/utils/
// masterFieldResolver.ts) is still the right engine to walk master_field
// links against a real Individual's data - this just reshapes a DTM
// Placeholder into the EcPlaceholder-like object that resolver expects,
// mirroring consultancy-contracts/utils/ccPlaceholderAdapter.ts's
// dtmPlaceholderToResolverInput (same pattern, different entity: Biodata is
// always entity_type ['individual'] with no company in scope, so companyId
// is always passed as null wherever this is resolved).
export function biodataPlaceholderToResolverInput(p: Placeholder): EcPlaceholder {
  const strategy: MasterFieldLink['strategy'] = p.source_logic === 'all' ? 'merge' : 'fallback';
  const masterFieldLinks: MasterFieldLink[] = (p.master_field_ids || []).map((id, index) => ({
    master_field_id: String(id),
    display_priority: index + 1,
    strategy,
  }));

  return {
    id: p.id,
    key: p.name,
    label: p.display_value || p.name,
    group_label: getBiodataSection(p.section_key)?.title || 'Other',
    source_kind: 'master_field',
    master_field_id: masterFieldLinks[0]?.master_field_id ?? null,
    master_field_links: masterFieldLinks,
    entity_type: ['individual'],
    settings_key: null,
    offer_field: null,
    editable: p.editable ?? true,
    default_value: p.default_value || null,
    description: p.description || null,
    required: !!p.required,
    type: p.type === 'conditional' || p.type === 'boolean' || p.type === 'image' ? p.type : 'text',
    conditions: p.conditions || [],
    boolean_conditions: p.boolean_conditions || [],
    created_at: '',
    updated_at: '',
  };
}
