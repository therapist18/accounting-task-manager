// Kenyan statutory payroll deductions, rendered as the
// {{statutory_deductions_table}} placeholder in the salary_statutory_
// deductions clause (see standardPlaceholders.ts). Two sources feed this,
// both producing the same StatutoryDeductionsBreakdown shape:
//
//   1. Preferred - the Payroll app (E:\GitHub\Payroll, same Supabase project)
//      already runs real payroll for this employee and persists computed
//      PAYE/SHIF/AHL/NSSF/NITA into bcl_payroll_run_lines. When a line
//      exists, utils/payrollIntegration.ts fetches it and this file just
//      renders it - no recomputation, so the contract shows the same
//      figures Payroll actually withheld, not a parallel estimate that
//      could disagree with it.
//   2. Fallback - computeStatutoryDeductions() below, for employees with no
//      payroll history yet (e.g. a contract being drafted before their
//      first pay run). Kept as one canonical formula rather than freezing
//      computed figures into individual contracts' clause text (see
//      20260731000000_ec_salary_statutory_deductions_dynamic_benefits.sql) -
//      when a statutory rate changes, updating the constants below updates
//      every contract generated afterwards. The clause content itself still
//      states amounts are subject to the law "from time to time"; this is
//      an illustrative computation at today's rates, not a frozen
//      contractual promise of these exact figures.
//
// Rates current as of 2026 (mirrors Payroll's own defaults in
// E:\GitHub\Payroll\lib\data\settings.ts): NSSF Act 2013 (Amendment) Tier
// I/II with the Feb 2025 upper earnings limit; SHIF (Social Health
// Insurance Fund) at 2.75% of gross with a KES 300 floor; Affordable
// Housing Levy at 1.5% of gross; PAYE bands and personal relief per the
// Finance Act 2023; NITA training levy at the flat statutory rate.
const NSSF_LOWER_LIMIT = 8000;
const NSSF_UPPER_LIMIT = 72000;
const NSSF_RATE = 0.06;

const SHIF_RATE = 0.0275;
const SHIF_MINIMUM = 300;

const AHL_RATE = 0.015;

const NITA_LEVY = 50;

const PERSONAL_RELIEF = 2400;

// Cumulative monthly PAYE bands: each entry taxes the next `width` shillings
// of taxable pay at `rate`, in order, until taxable pay is exhausted.
const PAYE_BANDS: Array<{ width: number; rate: number }> = [
  { width: 24000, rate: 0.10 },
  { width: 8333, rate: 0.25 },
  { width: 467667, rate: 0.30 },
  { width: 300000, rate: 0.325 },
  { width: Infinity, rate: 0.35 },
];

export interface StatutoryDeductionsBreakdown {
  grossSalary: number;
  nssf: number;
  shif: number;
  ahl: number;
  taxablePay: number;
  paye: number;
  nita: number;
  totalDeductions: number;
  netPay: number;
}

function calculateNssf(grossSalary: number): number {
  const tier1 = NSSF_RATE * Math.min(grossSalary, NSSF_LOWER_LIMIT);
  const tier2 = NSSF_RATE * Math.max(0, Math.min(grossSalary, NSSF_UPPER_LIMIT) - NSSF_LOWER_LIMIT);
  return tier1 + tier2;
}

function calculateShif(grossSalary: number): number {
  return Math.max(grossSalary * SHIF_RATE, SHIF_MINIMUM);
}

function calculatePaye(taxablePay: number): number {
  let tax = 0;
  let remaining = taxablePay;
  for (const band of PAYE_BANDS) {
    if (remaining <= 0) break;
    const amountInBand = Math.min(remaining, band.width);
    tax += amountInBand * band.rate;
    remaining -= amountInBand;
  }
  return Math.max(0, tax - PERSONAL_RELIEF);
}

export function computeStatutoryDeductions(grossSalary: number): StatutoryDeductionsBreakdown {
  const nssf = calculateNssf(grossSalary);
  const shif = calculateShif(grossSalary);
  const ahl = grossSalary * AHL_RATE;
  const taxablePay = Math.max(0, grossSalary - nssf - shif - ahl);
  const paye = calculatePaye(taxablePay);
  // NITA is an employer-borne training levy, not withheld from the
  // employee's pay (confirmed against KRA's own PAYE calculator, which
  // excludes it from "Pay after Tax") - it's shown in the table as a line
  // item but deliberately excluded from totalDeductions/netPay below.
  const totalDeductions = nssf + shif + ahl + paye;

  return {
    grossSalary,
    nssf,
    shif,
    ahl,
    taxablePay,
    paye,
    nita: NITA_LEVY,
    totalDeductions,
    netPay: grossSalary - totalDeductions,
  };
}

function formatKes(amount: number): string {
  return Math.round(amount).toLocaleString('en-US');
}

// Renders a breakdown as the same `details-table` markup convention every
// other clause table in the library uses, regardless of whether it came from
// a real Payroll run or the local fallback formula.
function renderStatutoryDeductionsTable(b: StatutoryDeductionsBreakdown): string {
  return `<table class="details-table statutory-deductions-table">
  <tr><td class="label-cell">Gross Salary</td><td>KES ${formatKes(b.grossSalary)}</td></tr>
  <tr><td class="label-cell">Taxable Pay</td><td>KES ${formatKes(b.taxablePay)}</td></tr>
  <tr><td class="label-cell">PAYE</td><td>KES ${formatKes(b.paye)}</td></tr>
  <tr><td class="label-cell">SHIF/SHA (2.75%)</td><td>KES ${formatKes(b.shif)}</td></tr>
  <tr><td class="label-cell">AHL – Housing Levy (1.5%)</td><td>KES ${formatKes(b.ahl)}</td></tr>
  <tr><td class="label-cell">NSSF</td><td>KES ${formatKes(b.nssf)}</td></tr>
  <tr><td class="label-cell">NITA</td><td>KES ${formatKes(b.nita)}</td></tr>
  <tr class="total-row"><td><strong>Net Pay</strong></td><td><strong>KES ${formatKes(b.netPay)}</strong></td></tr>
</table>`;
}

// Builds the {{statutory_deductions_table}} value. Prefers `payrollLine` -
// the actual figures Payroll already computed and persisted for this
// employee (see payrollIntegration.ts) - and only falls back to computing
// from gross_salary locally when no payroll run exists yet. Returns '' when
// neither source has anything to show, so the clause renders blank rather
// than a table full of zeroes (matches the "blank until linked" convention
// used elsewhere - see project memory on Employment Contracts Placeholders).
export function buildStatutoryDeductionsTable(
  grossSalaryRaw: string | number | null | undefined,
  payrollLine?: StatutoryDeductionsBreakdown | null
): string {
  if (payrollLine) return renderStatutoryDeductionsTable(payrollLine);

  const grossSalary = typeof grossSalaryRaw === 'number' ? grossSalaryRaw : parseFloat(String(grossSalaryRaw || '').replace(/,/g, ''));
  if (!grossSalary || grossSalary <= 0) return '';

  return renderStatutoryDeductionsTable(computeStatutoryDeductions(grossSalary));
}
