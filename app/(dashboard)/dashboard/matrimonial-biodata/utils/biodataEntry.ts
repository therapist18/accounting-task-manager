import { supabase } from '@/lib/supabase/client';

// Per-individual saved state for the Biodata editor/preview: which theme is
// selected, manual overrides keyed by placeholder name (same keying
// resolveBiodataValues uses), and the chosen gallery images. Mirrors how
// Employment Contracts persists per-contract overrides on the offer row
// (offer.placeholder_overrides) - Biodata has no per-contract row to piggyback
// on, so this gets its own table (matrimonial_biodata_entries).
export interface BiodataEntry {
  id: string;
  individual_id: string | number;
  theme: string;
  overrides: Record<string, string>;
  images: string[];
  updated_at: string;
}

export async function fetchBiodataEntry(individualId: string | number | null | undefined): Promise<BiodataEntry | null> {
  if (individualId == null) return null;
  const { data, error } = await supabase
    .from('matrimonial_biodata_entries')
    .select('id, individual_id, theme, overrides, images, updated_at')
    .eq('individual_id', individualId)
    .maybeSingle();

  if (error) {
    console.error('Error fetching biodata entry:', error);
    return null;
  }
  return data as BiodataEntry | null;
}

export async function upsertBiodataEntry(
  individualId: string | number,
  updates: { theme?: string; overrides?: Record<string, string>; images?: string[] }
): Promise<BiodataEntry | null> {
  const { data, error } = await supabase
    .from('matrimonial_biodata_entries')
    .upsert(
      { individual_id: individualId, ...updates, updated_at: new Date().toISOString() },
      { onConflict: 'individual_id' }
    )
    .select('id, individual_id, theme, overrides, images, updated_at')
    .single();

  if (error) {
    console.error('Error saving biodata entry:', error);
    return null;
  }
  return data as BiodataEntry;
}
