import supabase from '@/lib/supabase/client';
import { fetchPlaceholders } from '../../employment-contracts/utils/ecPlaceholders';

export interface MasterFieldOption {
  id: string;
  label: string;
  field_key: string;
}

// Same {{token}} shape the rest of the app's document engines use (see
// replacePlaceholders in tasks-requirements/utils/templateFormatters.ts).
export function detectTokens(content: string): string[] {
  if (!content) return [];
  const matches = Array.from(content.matchAll(/\{\{(\w+)\}\}/g)).map((m) => m[1]);
  return Array.from(new Set(matches));
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '').trim();
}

// Same normalize + exact-or-substring matching as
// employment-contracts/utils/placeholderDetection.ts' findBestMasterFieldMatch.
export function findBestMasterFieldMatch(tokenKey: string, masterFields: MasterFieldOption[]): MasterFieldOption | null {
  const normalizedToken = normalize(tokenKey);
  if (!normalizedToken || masterFields.length === 0) return null;

  let bestMatch: MasterFieldOption | null = null;
  let bestScore = -1;

  for (const field of masterFields) {
    const normalizedLabel = normalize(field.label);
    const normalizedKey = normalize(field.field_key);

    let score = -1;
    if (normalizedToken === normalizedKey || normalizedToken === normalizedLabel) score = 3;
    else if (normalizedLabel.includes(normalizedToken) || normalizedKey.includes(normalizedToken)) score = 2;
    else if (normalizedToken.includes(normalizedLabel) || normalizedToken.includes(normalizedKey)) score = 1;

    if (score > bestScore) {
      bestScore = score;
      bestMatch = field;
    }
  }

  return bestScore >= 0 ? bestMatch : null;
}

export function humanizeKey(key: string): string {
  return key
    .split('_')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export async function fetchMasterFieldOptions(): Promise<MasterFieldOption[]> {
  const { data, error } = await supabase.from('tm_job_fields').select('id, label, field_key').order('label');
  if (error) {
    console.error('Error fetching master fields:', error);
    return [];
  }
  return (data || []) as MasterFieldOption[];
}

// Scans the template body for {{tokens}} and registers any not already in
// ec_placeholders (the shared registry this module reuses - see the note in
// 20260813000000_consultancy_contract_engine.sql). A token this module
// shares with Employment Contracts (company_name, company_kra_pin, ...) is
// never duplicated - only genuinely new keys get a new row here, tagged
// group_label='Consultancy Contract' and entity_type=['company'] so this
// module's own resolver (which is always company-scoped, no individual_id)
// picks them up correctly. Fuzzy-matches new rows against tm_job_fields the
// same way employment-contracts/utils/placeholderDetection.ts does. Returns
// the newly-registered token keys for caller feedback.
export async function syncPlaceholdersFromContent(content: string): Promise<string[]> {
  const tokens = detectTokens(content);
  if (tokens.length === 0) return [];

  const existing = await fetchPlaceholders();
  const existingKeys = new Set(existing.map((p) => p.key));
  const newTokens = tokens.filter((t) => !existingKeys.has(t));
  if (newTokens.length === 0) return [];

  const masterFields = await fetchMasterFieldOptions();
  const rows = newTokens.map((key) => {
    const match = findBestMasterFieldMatch(key, masterFields);
    return {
      key,
      label: humanizeKey(key),
      group_label: 'Consultancy Contract',
      source_kind: 'master_field' as const,
      master_field_id: match?.id ?? null,
      entity_type: ['company'],
      editable: true,
    };
  });

  const { error } = await supabase.from('ec_placeholders').insert(rows);
  if (error) {
    console.error('Error syncing detected consultancy placeholders:', error);
    return [];
  }
  return newTokens;
}
