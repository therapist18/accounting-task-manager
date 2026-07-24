import supabase from '@/lib/supabase/client';

export type PlaceholderSourceKind = 'master_field' | 'settings_cascade' | 'offer';

export interface EcPlaceholder {
  id: string;
  key: string;
  label: string;
  group_label: string;
  source_kind: PlaceholderSourceKind;
  // Only meaningful when source_kind = 'master_field' - FK into tm_job_fields.
  // Null means "not linked yet", not "has no data source".
  master_field_id: string | null;
  settings_key: string | null;
  offer_field: string | null;
  editable: boolean;
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

// Only master_field_id is ever edited via the Data Sources admin page today -
// the rest of a placeholder's shape (key, group, source_kind, ...) is fixed
// by what standardPlaceholders.ts actually computes, not admin-editable.
export async function linkPlaceholderMasterField(id: string, masterFieldId: string | null): Promise<EcPlaceholder | null> {
  const { data, error } = await supabase
    .from('ec_placeholders')
    .update({ master_field_id: masterFieldId, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error linking placeholder to master field:', error);
    throw error;
  }
  return data as EcPlaceholder;
}
