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
    company_role: p.company_role ?? null,
    is_block_start: p.is_block_start ?? false,
    parent_name: p.parent_name || undefined,
    array_direction: p.array_direction || undefined,
    director_type: p.director_type || undefined,
    dependant_relationship: p.dependant_relationship || undefined,
  };
}

// Which of the two companies-in-one-document a placeholder resolves against.
// An explicit company_role (set via Settings' placeholder editor - see
// PlaceholderFormDialog.tsx's showCompanyRoleField) always wins; otherwise
// falls back to the consultant_ key-prefix heuristic. Needed because a field
// like {{director_name}} has no prefix to auto-detect from, but still needs
// to resolve against ONE specific company, not silently default to the
// client (see page.tsx's resolveContractValues / DataValuesPanel.tsx's
// per-row company routing, both of which call this instead of re-deriving
// the prefix check independently).
export function resolveCompanyRole(p: { key: string; company_role?: 'client' | 'consultant' | null }): 'client' | 'consultant' {
  if (p.company_role === 'consultant' || p.company_role === 'client') return p.company_role;
  return p.key.startsWith('consultant_') ? 'consultant' : 'client';
}

// Consultant (Booksmart Consultancy Limited) vs Client (the selected
// company) vs everything else (fees, dates, refs...) - purely a display
// grouping for Data & Values. Only the fields with NO explicit company_role
// AND no recognizable key prefix fall into "Contract Details" - an explicit
// company_role always earns its own group, even without a matching prefix.
export function inferGroupLabel(p: { key: string; company_role?: 'client' | 'consultant' | null }): string {
  if (p.company_role === 'consultant') return 'Consultant';
  if (p.company_role === 'client') return 'Client';
  if (p.key.startsWith('consultant_')) return 'Consultant';
  if (p.key.startsWith('client_') || p.key.startsWith('company_')) return 'Client';
  return 'Contract Details';
}
