import supabase from '@/lib/supabase/client';

// 'job_profile' = a structured column on the selected EcJobProfile itself
// (e.g. requirements/key_responsibilities) - reuses the settings_key column
// to name which EcJobProfile field to read, distinct from 'settings_cascade'
// (which reads .settings JSONB through the 4-level inheritance cascade).
export type PlaceholderSourceKind = 'master_field' | 'settings_cascade' | 'offer' | 'job_profile';

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
  master_field_id?: string | null;
  master_field_links?: MasterFieldLink[];
  entity_type?: string[];
  default_value?: string | null;
  description?: string | null;
  required?: boolean;
  // Only set by the EC-only "Edit Source" dialog (PlaceholderSources.tsx) -
  // the reused DTM PlaceholderFormDialog has no concept of settings_key/
  // offer_field/source_kind, so dtmPlaceholderToEcUpdates never touches these.
  source_kind?: PlaceholderSourceKind;
  settings_key?: string | null;
  offer_field?: string | null;
  // Whether a user can override this placeholder's resolved value in the
  // Contract Editor's Data & Values table (see ContractEditor.tsx) - set via
  // PlaceholderFormDialog's "Lock Value" checkbox (showSourceField gate).
  editable?: boolean;
}

// Persists either: everything the reused DTM PlaceholderFormDialog can map
// onto an EcPlaceholder (see ecPlaceholderAdapter.ts - the dialog's many
// other fields like type/conditions/checklist config/ai_prompt have no
// EcPlaceholder column and are silently dropped, not persisted), or the
// source_kind/settings_key/offer_field fields the EC-only Edit Source dialog
// sets, which DTM's dialog knows nothing about.
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
