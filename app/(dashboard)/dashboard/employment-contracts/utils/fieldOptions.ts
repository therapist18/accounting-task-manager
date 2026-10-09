// Curated dropdown values for contract fields. ec_placeholders carries no
// options of its own, so fields listed here render as a dropdown instead of
// free text - in the editor's Contract Fields panel (per-contract values, see
// ContractEditor.tsx's PlaceholderRow) and, for the shared lists, the Job
// Profiles settings tab.

export const NOTICE_OPTIONS = ['1 Week', '2 Weeks', '1 Month', '2 Months', '3 Months'];

// Per-contract field key -> allowed values.
export const CONTRACT_FIELD_OPTIONS: Record<string, string[]> = {
  probation_period: ['3 Months', '6 Months'],
  probation_notice_period: NOTICE_OPTIONS,
  notice_period: NOTICE_OPTIONS,
};

// Options for a field, with its current value matched case-insensitively
// ("3 months" selects "3 Months") and, if it's a legacy value not in the
// list, kept as an extra option so it isn't silently blanked.
export function fieldSelectOptions(key: string, currentValue: string): { options: string[]; selected: string | null } | null {
  const options = CONTRACT_FIELD_OPTIONS[key];
  if (!options) return null;
  const value = currentValue.trim();
  if (!value) return { options, selected: null };
  const match = options.find((o) => o.toLowerCase() === value.toLowerCase());
  return match ? { options, selected: match } : { options: [...options, value], selected: value };
}
