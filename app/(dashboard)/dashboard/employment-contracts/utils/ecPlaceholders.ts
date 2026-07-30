import supabase from '@/lib/supabase/client';

export type PlaceholderSourceKind = 'master_field' | 'settings_cascade' | 'offer';

export type LinkStrategy = 'merge' | 'fallback';

export interface MasterFieldLink {
  master_field_id: string;
  display_priority: number;
  strategy: LinkStrategy;
}

export interface EcPlaceholder {
  id: string;
  key: string;
  label: string;
  group_label: string;
  source_kind: PlaceholderSourceKind;
  // Only meaningful when source_kind = 'master_field' - FK into tm_job_fields.
  // Null means "not linked yet", not "has no data source".
  master_field_id: string | null;
  // Multiple master field links with display priority (supersedes master_field_id)
  master_field_links: MasterFieldLink[];
  // Entity types this placeholder applies to
  entity_type: string[];
  settings_key: string | null;
  offer_field: string | null;
  editable: boolean;
  default_value: string | null;
  description: string | null;
  required: boolean;
  created_at: string;
  updated_at: string;
}

export async function fetchPlaceholders(): Promise<EcPlaceholder[]> {
  const { data, error } = await supabase
    .from('ec_placeholders')
    .select('*')
    .order('group_label', { ascending: true })
    .order('label', { ascending: true });

  if (error) {
    console.error('Error fetching placeholders:', error);
    return [];
  }
  return (data || []) as EcPlaceholder[];
}

export interface PlaceholderDetailsUpdate {
  master_field_id: string | null;
  master_field_links: MasterFieldLink[];
  entity_type: string[];
  default_value: string | null;
  description: string | null;
  required: boolean;
}

// Persists everything the reused DTM PlaceholderFormDialog can actually map
// onto an EcPlaceholder (see ecPlaceholderAdapter.ts) - the dialog's many
// other fields (type, conditions, checklist config, image config, ai_prompt,
// job question / requirement links, ...) have no EcPlaceholder column and
// are silently dropped, not persisted.
export async function updatePlaceholderDetails(
  id: string,
  updates: PlaceholderDetailsUpdate
): Promise<EcPlaceholder | null> {
  const { data, error } = await supabase
    .from('ec_placeholders')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error updating placeholder details:', error);
    throw error;
  }
  return data as EcPlaceholder;
}
