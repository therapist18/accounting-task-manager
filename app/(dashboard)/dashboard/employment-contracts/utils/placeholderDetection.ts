import supabase from '@/lib/supabase/client';
import { fetchPlaceholders } from './ecPlaceholders';
import { detectPlaceholderTags } from '../../templates/document-template-manager/utils';

export interface MasterFieldOption {
  id: string;
  label: string;
  field_key: string;
}

// Same {{token}} shape clauses actually use (see replacePlaceholders in
// tasks-requirements/utils/templateFormatters.ts) - scanned with DTM's own
// prefix-aware tag detector (double-brace syntax) so {{%token}} image tags
// and {{#token}}/{{#condition_token}} blocks are also picked up, always
// keyed by the bare token name (the {{%}} prefix is a display-type marker,
// not part of the registry key).
export function detectTokens(content: string): string[] {
  if (!content) return [];
  return Array.from(new Set(detectPlaceholderTags(content, 2).map((t) => t.key)));
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '').trim();
}

// Ported from findMatchingMasterFields in
// templates/document-template-manager/utils.ts - same normalize + exact-or-
// substring matching, trimmed to a single best match since ec_placeholders
// links one master field per token (not DTM's master_field_ids[] array).
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

// Scans one or more clause bodies for {{tokens}}, registers any that aren't
// already in ec_placeholders yet (as source_kind='master_field', since that's
// the only kind auto-detection can meaningfully populate - settings_cascade/
// offer tokens are the fixed set standardPlaceholders.ts already computes),
// and immediately attempts a fuzzy auto-match against tm_job_fields - same
// "detect -> auto-suggest a master field" flow as
// findMatchingMasterFields/extractPlaceholders in Document Template Manager.
// Returns the newly-registered token keys for caller feedback (e.g. a toast).
export async function syncPlaceholdersFromContent(contents: string[]): Promise<string[]> {
  const tokens = Array.from(new Set(contents.flatMap((c) => detectTokens(c))));
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
      group_label: 'Custom',
      source_kind: 'master_field' as const,
      master_field_id: match?.id ?? null,
      settings_key: null,
      offer_field: null,
      editable: true,
    };
  });

  const { error } = await supabase.from('ec_placeholders').insert(rows);
  if (error) {
    console.error('Error syncing detected placeholders:', error);
    return [];
  }
  return newTokens;
}
