import type { Placeholder } from '../../templates/document-template-manager/types';
import type { EcPlaceholder, MasterFieldLink } from './ecPlaceholders';

// The single source of truth for "what does the Source text field in the
// add/edit dialog currently hold" - reused by both the dialog (via
// ecPlaceholderToDtmPlaceholder) and PlaceholderSources.tsx's table caption,
// so the table always shows exactly what's fed into the dialog, never a
// second derivation that can drift out of sync with it.
export function getPlaceholderSourceText(ec: EcPlaceholder): string {
  return ec.source_kind === 'offer' ? (ec.offer_field || '') : (ec.settings_key || '');
}

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
    // The dialog's plain-text Source field reads/writes whichever column the
    // placeholder's current source_kind actually resolves from (settings_key
    // for settings_cascade/job_profile/master_field, offer_field for offer) -
    // see dtmPlaceholderToEcUpdates for the write-back side of this mapping.
    source: getPlaceholderSourceText(ec),
  };
}

export function dtmPlaceholderToEcUpdates(updated: Placeholder, original: EcPlaceholder) {
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

  // source_kind itself isn't editable from this dialog (it's set when the
  // placeholder is created/synced, or via the inline Source Kind select in
  // PlaceholderSources.tsx's table) - only the text naming which settings_key/
  // offer_field it points at changes here, into whichever column that kind
  // actually uses.
  const sourceText = (updated.source || '').trim() || null;
  const isOfferKind = original.source_kind === 'offer';

  return {
    master_field_id: masterFieldLinks.length > 0 ? masterFieldLinks[0].master_field_id : null,
    master_field_links: masterFieldLinks,
    entity_type: (updated.entity_type || []) as string[],
    default_value: updated.default_value || null,
    description: updated.description || null,
    required: !!updated.required,
    settings_key: isOfferKind ? original.settings_key : sourceText,
    offer_field: isOfferKind ? sourceText : original.offer_field,
  };
}
