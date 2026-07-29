import type { Placeholder } from '../../templates/document-template-manager/types';
import type { EcPlaceholder } from './ecPlaceholders';

// EcPlaceholder only ever needs ONE master field (tm_job_fields.sources
// already owns multi-source/priority resolution one level down - see the
// header comment in supabase/migrations/20260723000002_ec_placeholders.sql),
// so `master_field_ids` here is a 0-or-1-element array purely to satisfy
// PlaceholderFormDialog's shape - never actually multi-select for EC.
export function ecPlaceholderToDtmPlaceholder(ec: EcPlaceholder): Placeholder {
  return {
    id: ec.id,
    name: ec.key,
    display_value: ec.label,
    description: ec.description || '',
    default_value: ec.default_value || '',
    type: 'text',
    required: ec.required,
    entity_type: [],
    master_field_ids: ec.master_field_id != null ? [Number(ec.master_field_id)] : [],
  };
}

// Only these four fields have a real home on EcPlaceholder - everything else
// PlaceholderFormDialog lets you edit (type-specific config, conditions,
// checklist/image config, job question & requirement links, ai_prompt, ...)
// has no EC equivalent and is intentionally dropped here.
export function dtmPlaceholderToEcUpdates(updated: Placeholder) {
  const masterFieldId = updated.master_field_ids?.[0];
  return {
    master_field_id: masterFieldId != null ? String(masterFieldId) : null,
    default_value: updated.default_value || null,
    description: updated.description || null,
    required: !!updated.required,
  };
}
