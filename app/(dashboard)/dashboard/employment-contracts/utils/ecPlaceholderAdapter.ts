import type { Placeholder } from '../../templates/document-template-manager/types';
import type { EcPlaceholder, MasterFieldLink } from './ecPlaceholders';

export function ecPlaceholderToDtmPlaceholder(ec: EcPlaceholder): Placeholder {
  // Build master_field_ids from master_field_links (ordered by display_priority),
  // falling back to the legacy single master_field_id for backward compat
  let masterFieldIds: number[] = [];
  if (ec.master_field_links && ec.master_field_links.length > 0) {
    masterFieldIds = [...ec.master_field_links]
      .sort((a, b) => a.display_priority - b.display_priority)
      .map((link) => Number(link.master_field_id));
  } else if (ec.master_field_id != null) {
    masterFieldIds = [Number(ec.master_field_id)];
  }

  return {
    id: ec.id,
    name: ec.key,
    display_value: ec.label,
    description: ec.description || '',
    default_value: ec.default_value || '',
    type: 'text',
    required: ec.required,
    entity_type: (ec.entity_type || []) as any,
    master_field_ids: masterFieldIds,
  };
}

export function dtmPlaceholderToEcUpdates(updated: Placeholder) {
  const masterFieldIds = updated.master_field_ids || [];
  const masterFieldLinks: MasterFieldLink[] = masterFieldIds.map((id, index) => ({
    master_field_id: String(id),
    display_priority: index + 1,
    strategy: 'fallback',
  }));

  return {
    master_field_id: masterFieldLinks.length > 0 ? masterFieldLinks[0].master_field_id : null,
    master_field_links: masterFieldLinks,
    entity_type: (updated.entity_type || []) as string[],
    default_value: updated.default_value || null,
    description: updated.description || null,
    required: !!updated.required,
  };
}
