// Canonical option lists for the handful of Job Profile / Clause fields that
// are genuinely bounded categories (not open-ended text like Department or
// Job Level, which vary too much per company to constrain). Keeping these
// as a fixed vocabulary also keeps matchJobProfile/suggestClauseForSection's
// exact string comparisons reliable - free text here previously invited
// typos that silently broke matching.
export const EMPLOYMENT_TYPE_OPTIONS = ['Permanent', 'Contract', 'Probation', 'Temporary', 'Internship', 'Casual'];
export const WORK_ARRANGEMENT_OPTIONS = ['Office', 'Remote', 'Hybrid'];

// Merges a stored value into a preset option list so existing records typed
// before this dropdown existed (or from another company's odd convention)
// still render as a selectable, visible value instead of appearing blank.
export function withCurrentValue(options: string[], current: string | null | undefined): string[] {
  if (!current || options.includes(current)) return options;
  return [...options, current];
}
