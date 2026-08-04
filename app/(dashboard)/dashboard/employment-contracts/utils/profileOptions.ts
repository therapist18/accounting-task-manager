// Canonical option lists for the handful of Job Profile / Clause fields that
// are genuinely bounded categories (not open-ended text like Department or
// Job Level, which vary too much per company to constrain). Keeping these
// as a fixed vocabulary also keeps matchJobProfile/suggestClauseForSection's
// exact string comparisons reliable - free text here previously invited
// typos that silently broke matching.
export const EMPLOYMENT_TYPE_OPTIONS = ['Permanent', 'Contract', 'Probation', 'Temporary', 'Internship', 'Casual'];
export const WORK_ARRANGEMENT_OPTIONS = ['Office', 'Remote', 'Hybrid'];

// Department stays open-ended per the comment above (real options come from
// the company's own configured vocabulary or its employees' actual
// department values - see fetchCompanyDepartmentsFromEmployees in
// companySettings.ts). This is only a last-resort default for a company
// with neither yet, so a brand-new company's Department picker isn't empty -
// mirrors Payroll's own COMMON_DEPARTMENTS fallback
// (E:\GitHub\Payroll\app\api\companies\[id]\structure\route.ts) for the same
// "nothing configured yet" case.
export const DEFAULT_DEPARTMENT_OPTIONS = ['Administration', 'Finance', 'Human Resources', 'IT', 'Operations', 'Sales & Marketing'];

// Merges a stored value into a preset option list so existing records typed
// before this dropdown existed (or from another company's odd convention)
// still render as a selectable, visible value instead of appearing blank.
export function withCurrentValue(options: string[], current: string | null | undefined): string[] {
  if (!current || options.includes(current)) return options;
  return [...options, current];
}
