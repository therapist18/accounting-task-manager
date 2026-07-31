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

  // DTM's PlaceholderSourceManager only has ONE logic toggle for the whole
  // placeholder ('priority' | 'all'), not per-link - EC's master_field_links
  // has a per-link `strategy` because it reuses the same MasterFieldLink shape
  // the resolver walks, but nothing before this ever actually saved mixed
  // strategies (see dtmPlaceholderToEcUpdates below), so any link being
  // 'merge' means the whole placeholder was set to "Return All (Merge)".
  const source_logic: Placeholder['source_logic'] =
    ec.master_field_links?.some((l) => l.strategy === 'merge') ? 'all' : 'priority';

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
    source_logic,
  };
}

export function dtmPlaceholderToEcUpdates(updated: Placeholder) {
  const masterFieldIds = updated.master_field_ids || [];
  // Map DTM's single per-placeholder source_logic onto every link's strategy -
  // 'all' (its "Return All (Merge)" option) -> 'merge' for every link, so
  // resolveEcPlaceholderValues (masterFieldResolver.ts) actually concatenates
  // all of them instead of stopping at the first. This was previously
  // hardcoded to 'fallback' regardless of what the dialog's Logic dropdown
  // was set to, so picking "Return All (Merge)" silently never persisted.
  const strategy: MasterFieldLink['strategy'] = updated.source_logic === 'all' ? 'merge' : 'fallback';
  const masterFieldLinks: MasterFieldLink[] = masterFieldIds.map((id, index) => ({
    master_field_id: String(id),
    display_priority: index + 1,
    strategy,
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
