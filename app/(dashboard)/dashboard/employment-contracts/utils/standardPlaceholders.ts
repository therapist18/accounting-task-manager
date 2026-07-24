import type { ContractEmployeeInfo } from './data';
import type { Company } from '../../companies/database';
import type { EmploymentOffer } from './employmentOfferData';
import type { EcPlaceholder } from './ecPlaceholders';

// Builds the full set of well-known placeholder tokens that clause content
// may reference as {{token_name}}. Values come from five sources, merged
// in precedence order (later wins on key collisions):
//
//   1. Employee identity fields (name, ID, bank, etc.)
//   2. Company identity fields (name, registration, etc.)
//   3. Offer-specific fields (salary, dates, currency)
//   4. Effective settings from the cascade (working hours, notice period,
//      benefits, leave, probation, etc.) — passed through so clause content
//      can reference {{notice_period}}, {{medical_cover}}, etc. directly.
//   5. Linked master-field values - for each ec_placeholders row with
//      source_kind='master_field' and a master_field_id set, the value
//      resolved from tm_job_fields (see masterFieldResolver.ts) replaces the
//      1-4 default for that key. This is the "single source of truth" path:
//      once a placeholder is linked, its data comes from the same master
//      field Document Template Manager and every other consumer would use,
//      not a value hardcoded in this function. Unlinked placeholders simply
//      keep their 1-4 default - nothing breaks while linking is in progress.
//   6. placeholderOverrides - explicit per-contract overrides from
//      offer.placeholder_overrides (see ContractEditor.tsx's Placeholders &
//      Values tab). Always wins, even over a linked master field - this is
//      the one place a user can deliberately diverge a single contract from
//      the Employee/Company record without editing that record.
//
// This replaces the old tasks-requirements master-field engine for the
// Employment Contracts module. The caller in ContractPreview.tsx passes
// effectiveSettings resolved by clauseEngine.resolveEffectiveSettings.
export function buildStandardPlaceholderValues(
  employee: ContractEmployeeInfo,
  company: Company | null | undefined,
  offer: EmploymentOffer | null | undefined,
  effectiveSettings?: Record<string, any>,
  placeholderOverrides?: Record<string, string>,
  ecPlaceholders?: EcPlaceholder[],
  masterFieldValues?: Record<string, string>
): Record<string, string> {
  const contactEmail = company?.contact_details?.email || '';

  // Format allowances from the offer into a readable list.
  const allowances = offer?.allowances || [];
  const allowancesList = allowances.length > 0
    ? allowances.map((a) => (a.amount != null ? `${a.label}: ${a.amount}` : a.label)).join(', ')
    : '';

  // Settings keys that should be exposed as top-level placeholders even
  // if they also flow through effectiveSettings. This ensures clause content
  // can reference them with or without explicit settings being configured.
  const s = effectiveSettings || {};

  const defaults: Record<string, string> = {
    // ── Employee identity ──────────────────────────────────────────────
    employee_name: employee.fullName,
    employee_first_name: employee.firstName,
    employee_last_name: employee.lastName,
    employee_id: employee.employeeNumber,
    employee_number: employee.employeeNumber,
    national_id: employee.nationalId,
    kra_pin: employee.kraPin,
    nssf_number: employee.nssfNumber,
    shif_number: employee.shifNumber,
    nhif_number: employee.nhifNumber,
    bank_name: employee.bankName,
    bank_branch: employee.bankBranch,
    bank_account: employee.bankAccount,
    contact_email: employee.contactEmail,
    contact_phone: employee.contactPhone,

    // ── Company identity ───────────────────────────────────────────────
    company_name: company?.company_name || '',
    company_address: company?.contact_details?.address || '',
    company_kra_pin: company?.kra_pin || '',
    company_email: company?.kra_email_address || contactEmail,
    company_registration_number: company?.registration_number || '',

    // ── Employment details (from employee row) ─────────────────────────
    department: employee.department,
    job_title: employee.jobTitle,
    employment_type: employee.employmentType,
    employment_status: employee.status || 'Active',
    job_level: String(s.job_level || ''),
    reports_to: String(s.reports_to || ''),
    work_location: String(s.work_location || ''),
    work_arrangement: employee.workArrangement,

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

  const masterFieldOverlay: Record<string, string> = {};
  if (ecPlaceholders && masterFieldValues) {
    for (const p of ecPlaceholders) {
      if (p.source_kind !== 'master_field' || !p.master_field_id) continue;
      const resolved = masterFieldValues[p.master_field_id];
      if (resolved !== undefined) masterFieldOverlay[p.key] = resolved;
    }
  }

  return { ...defaults, ...masterFieldOverlay, ...placeholderOverrides };
}
