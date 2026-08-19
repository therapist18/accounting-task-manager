import type { Placeholder } from '../../templates/document-template-manager/types';
import type { EcPlaceholder, MasterFieldLink } from '../../employment-contracts/utils/ecPlaceholders';

// Consultancy Contracts stores its placeholders directly on the template row
// (cc_templates.placeholders, a DTM Placeholder[] - see settings/page.tsx's
// handleSavePlaceholder/handleRescanPlaceholders), NOT in the ec_placeholders
// table Employment Contracts uses. resolveEcPlaceholderValues
// (masterFieldResolver.ts) is still the right engine to walk master_field
// links/conditions/boolean_conditions against real company data - this just
// reshapes a DTM Placeholder into the EcPlaceholder-like object that resolver
// expects, mirroring ecPlaceholderAdapter.ts's ecPlaceholderToDtmPlaceholder
// but for resolution instead of the settings-dialog UI.
export function dtmPlaceholderToResolverInput(p: Placeholder, groupLabel: string): EcPlaceholder {
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
    group_label: groupLabel,
    source_kind: 'master_field',
    master_field_id: masterFieldLinks[0]?.master_field_id ?? null,
    master_field_links: masterFieldLinks,
    entity_type: (p.entity_type || []) as string[],
    settings_key: null,
    offer_field: null,
    editable: p.editable ?? true,
    default_value: p.default_value || null,
    description: p.description || null,
    required: !!p.required,
    type: p.type === 'conditional' || p.type === 'boolean' ? p.type : 'text',
    conditions: p.conditions || [],
    boolean_conditions: p.boolean_conditions || [],
    created_at: '',
    updated_at: '',
  };
}

// Consultant (Booksmart Consultancy Limited) vs Client (the selected
// company) vs everything else (fees, dates, refs...) - purely a display
// grouping for Data & Values, derived from the key prefix rather than a
// group_label field DTM Placeholder doesn't have.
export function inferGroupLabel(key: string): string {
  if (key.startsWith('consultant_')) return 'Consultant';
  if (key.startsWith('client_') || key.startsWith('company_')) return 'Client';
  return 'Contract Details';
}
