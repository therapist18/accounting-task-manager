import type { ContractEmployeeInfo } from './data';
import type { Company } from '../../companies/database';
import type { EmploymentOffer } from './employmentOfferData';

// Builds the full set of well-known placeholder tokens that clause content
// may reference as {{token_name}}. Values come from four sources, merged
// in precedence order (later wins on key collisions):
//
//   1. Statutory/tax numbers and salary fields read directly off the
//      Employee/Offer record (kra_pin, nssf_number, shif_number, nhif_number,
//      company_kra_pin, basic_salary, gross_salary, currency, ...) - kept as
//      direct reads rather than master-field-linked, since these are
//      payroll/statutory identifiers, not general record facts.
//   2. Effective settings from the cascade (working hours, notice period,
//      benefits, leave, probation, job_level/reports_to/work_location, etc.)
//      — tm_job_fields has no concept of the Company → Department → Job
//      Profile → Offer inheritance cascade, so these can't be expressed as a
//      single master field and stay cascade-resolved.
//   3. Linked master-field values - for every OTHER ec_placeholders row
//      (source_kind='master_field': employee name/national ID/bank/contact,
//      company name/address/registration, department/job_title/employment_type/
//      employment_status/work_arrangement), the value resolved via
//      masterFieldResolver.ts's resolveEcPlaceholderValues - which shares its
//      core table/path/priority resolver with Document Template Manager (see
//      master-fields/utils/masterFieldValueResolver.ts) - replaces the
//      default for that key. Deliberately NO hardcoded fallback for these
//      keys anymore: until a placeholder is actually linked via the Data
//      Sources admin page, it renders blank rather than silently reusing an
//      old direct-read value that masked the missing link.
//   4. placeholderOverrides - explicit per-contract overrides from
//      offer.placeholder_overrides (see ContractEditor.tsx's Placeholders &
//      Values tab). Always wins, even over a linked master field - this is
//      the one place a user can deliberately diverge a single contract from
//      the Employee/Company record without editing that record.
//
// The caller in ContractPreview.tsx passes effectiveSettings resolved by
// clauseEngine.resolveEffectiveSettings and masterFieldValues resolved by
// useMasterFieldValues (both already keyed the way this function expects).
export function buildStandardPlaceholderValues(
  employee: ContractEmployeeInfo,
  company: Company | null | undefined,
  offer: EmploymentOffer | null | undefined,
  effectiveSettings?: Record<string, any>,
  placeholderOverrides?: Record<string, string>,
  masterFieldValues?: Record<string, string>
): Record<string, string> {
  // Format allowances from the offer into a readable list.
  const allowances = offer?.allowances || [];
  const allowancesList = allowances.length > 0
    ? allowances.map((a) => (a.amount != null ? `${a.label}: ${a.amount}` : a.label)).join(', ')
    : '';

  // Settings keys that should be exposed as top-level placeholders even
  // if they also flow through effectiveSettings. This ensures clause content
  // can reference them with or without explicit settings being configured.
  const s = effectiveSettings || {};

  const applicableBenefits = buildApplicableBenefitsList(s);

  const defaults: Record<string, string> = {
    // ── Employee identity ──────────────────────────────────────────────
    // Names/national ID/bank/contact fields are deliberately NOT hardcoded
    // here anymore - they're exactly the fields ec_placeholders seeds as
    // source_kind='master_field' (see 20260723000003_seed_ec_placeholders.sql),
    // so once linked via the Data Sources admin page they resolve through
    // masterFieldOverlay below instead. Until a given field is actually
    // linked, it simply renders blank - no silent hardcoded fallback to mask
    // that gap. employee_number has no ec_placeholders/master_field seed row
    // (only employee_id does), so it stays a direct field for now.
    employee_number: employee.employeeNumber,
    // Statutory ID / tax numbers stay direct reads from the Employees table
    // rather than master-field-linked, per the repo owner's decision - these
    // are payroll/statutory identifiers, not general "company record" facts.
    kra_pin: employee.kraPin,
    nssf_number: employee.nssfNumber,
    shif_number: employee.shifNumber,
    nhif_number: employee.nhifNumber,

    // ── Company identity ───────────────────────────────────────────────
    // Same statutory-number exception as above.
    company_kra_pin: company?.kra_pin || '',

    // ── Employment details (from settings cascade) ──────────────────────
    // job_level/reports_to/work_location stay settings-cascade (Company →
    // Department → Job Profile → Offer inheritance) rather than master-field
    // - tm_job_fields.sources has no concept of that cascade, so these can't
    // be expressed as a single table+path master field.
    job_level: String(s.job_level || ''),
    reports_to: String(s.reports_to || ''),
    work_location: String(s.work_location || ''),

    // ── Salary / compensation ──────────────────────────────────────────
    basic_salary: offer?.basic_salary != null ? String(offer.basic_salary) : String(employee.basicSalary || ''),
    gross_salary: offer?.basic_salary != null ? String(offer.basic_salary) : String(employee.grossSalary || ''),
    currency: offer?.currency || 'KES',
    payment_frequency: String(s.payment_frequency || 'Monthly'),
    payment_day: String(s.payment_day || ''),
    allowances: allowancesList,

    // ── Dates ──────────────────────────────────────────────────────────
    start_date: offer?.start_date || employee.startDate || '',
    end_date: offer?.end_date || '',

    // ── Working hours (from settings cascade) ──────────────────────────
    working_days: String(s.working_days || ''),
    working_hours: String(s.working_hours || ''),
    start_time: String(s.start_time || ''),
    end_time: String(s.end_time || ''),
    break_duration: String(s.break_duration || ''),
    rest_days: String(s.rest_days || ''),
    work_mode: String(s.work_mode || employee.workArrangement || ''),

    // ── Benefits (from settings cascade) ───────────────────────────────
    medical_cover: String(s.medical_cover || ''),
    housing_allowance: String(s.housing_allowance || ''),
    transport_allowance: String(s.transport_allowance || ''),
    telephone_allowance: String(s.telephone_allowance || ''),
    meal_allowance: String(s.meal_allowance || ''),
    pension_scheme: String(s.pension_scheme || ''),
    // Pre-rendered <li> markup for only the benefits actually active for this
    // employee - the Benefits clause references this as {{applicable_benefits}}
    // inside a <ul> instead of listing every possible benefit field and
    // leaving unused ones blank. See buildApplicableBenefitsList below.
    applicable_benefits: applicableBenefits,

    // ── Termination / probation (from settings cascade) ────────────────
    notice_period: String(s.notice_period || ''),
    probation_period: String(s.probation_period || ''),
    probation_notice: String(s.probation_notice || ''),
    termination_reason: String(s.termination_reason || ''),

    // ── Leave (from settings cascade) ──────────────────────────────────
    annual_leave_days: String(s.annual_leave_days || ''),
    sick_leave_days: String(s.sick_leave_days || ''),
    maternity_leave_days: String(s.maternity_leave_days || ''),
    paternity_leave_days: String(s.paternity_leave_days || ''),
    compassionate_leave_days: String(s.compassionate_leave_days || ''),
  };

  // resolveEcPlaceholderValues (masterFieldResolver.ts) already returns
  // values keyed by ec_placeholders.key and only for source_kind='master_field'
  // rows that actually resolved a value - nothing left to re-map here.
  const masterFieldOverlay = masterFieldValues || {};

  return { ...defaults, ...masterFieldOverlay, ...placeholderOverrides };
}

// Benefit fields that are amounts (rendered "KES {value} per month" when the
// value is numeric) vs schemes/named entitlements (rendered as plain text, or
// a generic eligibility line when the value is just a yes/no flag).
const BENEFIT_FIELD_DEFS: Array<{ key: string; label: string; kind: 'amount' | 'scheme' }> = [
  { key: 'medical_cover', label: 'Medical Cover', kind: 'scheme' },
  { key: 'pension_scheme', label: 'Pension', kind: 'scheme' },
  { key: 'housing_allowance', label: 'Housing Allowance', kind: 'amount' },
  { key: 'transport_allowance', label: 'Transport Allowance', kind: 'amount' },
  { key: 'telephone_allowance', label: 'Telephone Allowance', kind: 'amount' },
  { key: 'meal_allowance', label: 'Meal Allowance', kind: 'amount' },
];

const BENEFIT_TRUE_FLAGS = new Set(['yes', 'true', 'y', '1']);

function formatBenefitLine(label: string, rawValue: string, kind: 'amount' | 'scheme'): string | null {
  const value = rawValue.trim();
  if (!value) return null;

  if (kind === 'amount') {
    const amount = /^\d+(\.\d+)?$/.test(value) ? `KES ${value} per month` : value;
    return `<li><strong>${label}</strong> – ${amount}.</li>`;
  }

  if (BENEFIT_TRUE_FLAGS.has(value.toLowerCase())) {
    return `<li><strong>${label}</strong> – Employee is eligible for the Company's ${label.toLowerCase()} scheme.</li>`;
  }
  return `<li><strong>${label}</strong> – ${value}.</li>`;
}

// Renders only the benefits actually active for this employee (a settings
// value is present) as <li> markup for {{applicable_benefits}} - so one
// generic Benefits clause covers every combination of enrolled benefits
// instead of a separate contract variant per combination.
function buildApplicableBenefitsList(s: Record<string, any>): string {
  return BENEFIT_FIELD_DEFS
    .map((d) => formatBenefitLine(d.label, String(s[d.key] || ''), d.kind))
    .filter((line): line is string => !!line)
    .join('');
}
