import type { ContractEmployeeInfo } from './data';
import type { Company } from '../../companies/database';
import type { EmploymentOffer } from './employmentOfferData';
import type { EcJobProfile } from './jobProfileData';
import type { EcPlaceholder } from './ecPlaceholders';
import { buildStatutoryDeductionsTable, type StatutoryDeductionsBreakdown } from './statutoryDeductions';

// Date columns come back from the DB as YYYY-MM-DD (or a full ISO
// timestamp); contracts render them dd/mm/yyyy (Kenya's standard date
// format). Applied to every resolved value after the final merge so offer
// fields, master-field dates and per-contract overrides are all covered, not
// just the hardcoded start_date/end_date. String-based rather than
// new Date()-based so a midnight timestamp can never shift a day from
// timezone math, and idempotent - a value already in dd/mm/yyyy (e.g. an
// override the user typed) is left untouched.
function formatDateToDDMMYYYY(value: string): string {
  if (!value) return value;
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return iso ? `${iso[3]}/${iso[2]}/${iso[1]}` : value;
}

// Builds the full set of well-known placeholder tokens that clause content
// may reference as {{token_name}}. Values come from five layers, merged in
// precedence order (later wins on key collisions):
//
//   1. HARDCODED - a small, fixed set of keys with genuinely custom
//      resolution logic a plain "read one field" lookup can't express:
//      multi-source fallback chains (basic_salary/gross_salary/currency/
//      start_date/end_date - Offer wins, Employee record is the fallback),
//      formatted aggregates (allowances joined into a readable list,
//      applicable_benefits combining 6 separate settings into one rendered
//      list, key_responsibilities joining an array into <li> markup,
//      statutory_deductions_table rendering PAYE/SHIF/AHL/NSSF/NITA - via
//      statutoryDeductions.ts, preferring the real payroll line the caller
//      fetched (payrollStatutoryLine below) and falling back to computing
//      from gross_salary only when no payroll run exists yet),
//      and statutory/tax numbers kept as direct Employee/Company reads rather
//      than master-field-linked or settings-driven, per the repo owner's
//      explicit decision (payroll/statutory identifiers, not general record
//      facts). These always win regardless of what an ec_placeholders row
//      says for that key, since there's no single settings_key/offer_field
//      that could replicate the fallback/formatting logic anyway.
//   2. GENERIC dispatch - every OTHER placeholder in the ecPlaceholders
//      registry not covered by #1, resolved purely from its own key
//      (the token name itself, e.g. {{department}} -> key 'department') and
//      source_kind:
//        - 'settings_cascade' -> effectiveSettings[key]
//        - 'job_profile'      -> the same-named column on the selected
//                                 EcJobProfile (array columns join to <li>
//                                 markup)
//        - 'offer'            -> the named column on the Employment Offer
//                                 (still keyed by offer_field, since a
//                                 placeholder's own key doesn't have to match
//                                 the EmploymentOffer column it reads)
//        - 'master_field'     -> left alone here, resolved by layer 3 instead
//      Resolution is deliberately NOT keyed by settings_key - that column is
//      just an admin-facing description of where a settings_cascade/
//      job_profile placeholder's value comes from (e.g. "Job Profile
//      Settings", "Company Profile"), edited via PlaceholderSources.tsx's
//      Source field, and is expected to repeat across many placeholders that
//      share the same source. Keying resolution off it too (as an earlier
//      version of this file did) meant two placeholders with the same
//      settings_key silently read and wrote the exact same
//      effectiveSettings/draft.settings slot - typing into either one in the
//      Job Profile Fields tab overwrote the other's value.
//   3. Linked master-field values - for every ec_placeholders row with
//      source_kind='master_field', the value resolved via
//      masterFieldResolver.ts's resolveEcPlaceholderValues - which shares
//      its core table/path/priority resolver with Document Template Manager
//      (see master-fields/utils/masterFieldValueResolver.ts). Deliberately
//      NO fallback for these keys: until a placeholder is actually linked
//      via the Data Sources admin page, it renders blank rather than
//      silently reusing a value that would mask the missing link.
//   4. placeholderOverrides - explicit per-contract overrides from
//      offer.placeholder_overrides (see ContractEditor.tsx's Data & Values
//      panel). Always wins, even over a linked master field - this is the
//      one place a user can deliberately diverge a single contract from the
//      Employee/Company record without editing that record.
//
// The caller in ContractPreview.tsx/ContractEditor.tsx passes
// effectiveSettings resolved by clauseEngine.resolveEffectiveSettings,
// masterFieldValues resolved by useMasterFieldValues, and the same
// ecPlaceholders list useMasterFieldValues already fetched (all three
// already shaped the way this function expects).
export function buildStandardPlaceholderValues(
  employee: ContractEmployeeInfo,
  company: Company | null | undefined,
  offer: EmploymentOffer | null | undefined,
  effectiveSettings?: Record<string, any>,
  placeholderOverrides?: Record<string, string>,
  masterFieldValues?: Record<string, string>,
  jobProfile?: EcJobProfile | null,
  ecPlaceholders?: EcPlaceholder[],
  // The designated signatory director's name (resolved off
  // company.signatory_individual_id via companySignatory.ts's
  // fetchSignatoryName - the caller fetches it since it needs its own async
  // registry_individuals lookup, not something derivable from the args
  // already passed here). Title is fixed to 'Director' since that's the only
  // role this designation can point at (see companySignatory.ts /
  // fetchCompanyDirectors, which only lists current Directors).
  signatoryName?: string,
  // The employee's latest already-computed payroll line (PAYE/SHIF/AHL/
  // NSSF/NITA/net pay), fetched by the caller via
  // payrollIntegration.ts's fetchPayrollStatutoryLine - another async
  // lookup this function can't do itself (see signatoryName above for the
  // same reasoning). undefined/null means no payroll run exists yet for
  // this employee, in which case statutory_deductions_table falls back to
  // computing from gross_salary instead of reflecting real payroll figures.
  payrollStatutoryLine?: StatutoryDeductionsBreakdown | null
): Record<string, string> {
  // Format allowances from the offer into a readable list.
  const allowances = offer?.allowances || [];
  const allowancesList = allowances.length > 0
    ? allowances.map((a) => (a.amount != null ? `${a.label}: ${a.amount}` : a.label)).join(', ')
    : '';

  const s = effectiveSettings || {};

  const grossSalary = offer?.basic_salary != null ? String(offer.basic_salary) : String(employee.grossSalary || '');

  const hardcoded: Record<string, string> = {
    // employee_number has no ec_placeholders/master_field seed row (only
    // employee_id does), so it stays a direct field for now.
    employee_number: employee.employeeNumber,
    // Statutory ID / tax numbers stay direct reads from the Employees table
    // rather than master-field-linked, per the repo owner's decision - these
    // are payroll/statutory identifiers, not general "company record" facts.
    kra_pin: employee.kraPin,
    nssf_number: employee.nssfNumber,
    shif_number: employee.shifNumber,
    nhif_number: employee.nhifNumber,
    company_kra_pin: company?.kra_pin || '',
    // Already referenced in the original seed clause content (the
    // Signatures section) but never resolved by anything until this - see
    // companySignatory.ts for how the designated director is chosen/fetched.
    signatory_name: signatoryName || '',
    signatory_title: signatoryName ? 'Director' : '',

    // Multi-source fallback chains - Offer wins, Employee/settings record is
    // the fallback. Not expressible as a single settings_key/offer_field read.
    basic_salary: offer?.basic_salary != null ? String(offer.basic_salary) : String(employee.basicSalary || ''),
    gross_salary: grossSalary,
    currency: offer?.currency || String(s.salary_currency || '') || 'KES',
    start_date: offer?.start_date || employee.startDate || '',
    end_date: offer?.end_date || '',
    work_mode: String(s.work_mode || employee.workArrangement || ''),
    allowances: allowancesList,

    // Aggregates - combine multiple settings/columns into one rendered value.
    applicable_benefits: buildApplicableBenefitsList(s),
    key_responsibilities: (jobProfile?.key_responsibilities || []).map((r) => `<li>${r}</li>`).join(''),
    statutory_deductions_table: buildStatutoryDeductionsTable(grossSalary, payrollStatutoryLine),
  };

  const generic: Record<string, string> = {};
  for (const p of ecPlaceholders || []) {
    if (p.key in hardcoded) continue; // hardcoded formula always wins
    if (p.source_kind === 'settings_cascade') {
      generic[p.key] = String(s[p.key] ?? '');
    } else if (p.source_kind === 'job_profile') {
      const raw = (jobProfile as any)?.[p.key];
      generic[p.key] = Array.isArray(raw) ? raw.map((r) => `<li>${r}</li>`).join('') : String(raw ?? '');
    } else if (p.source_kind === 'offer' && p.offer_field) {
      generic[p.key] = String((offer as any)?.[p.offer_field] ?? '');
    }
    // 'master_field' kind is resolved entirely by masterFieldValues below.
  }

  const defaults: Record<string, string> = { ...hardcoded, ...generic };

  const masterFieldOverlay = masterFieldValues || {};
  const merged: Record<string, string> = { ...defaults, ...masterFieldOverlay, ...placeholderOverrides };
  const formatted: Record<string, string> = {};
  for (const [key, value] of Object.entries(merged)) formatted[key] = formatDateToDDMMYYYY(value);
  return formatted;
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
  // 'No' is the Benefits & Compensation tab's explicit "not entitled" answer
  // (see ALLOWANCE_OPTIONS in job-profiles/page.tsx) - treat it the same as
  // unset, not as a literal "Housing Allowance – No." line.
  if (!value || value.toLowerCase() === 'no') return null;

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
