import supabase from '@/lib/supabase/client';
import type { StatutoryDeductionsBreakdown } from './statutoryDeductions';

// Reads the latest already-computed PAYE/SHIF/AHL/NSSF/NITA figures for one
// employee straight out of the Payroll app's own tables (bcl_payroll_runs /
// bcl_payroll_run_lines) - same Supabase project as this app (see
// e:\GitHub\accounting-task-manager\.env's "shared with Payroll" comment).
// Direct client-side reads of a Payroll table are already an established
// pattern here (see fetchCompanyEmployees in data.ts querying
// bcl_payroll_salary_assignments), so this follows the same approach rather
// than standing up a separate API route.
//
// Returns null when the employee has no payroll run yet (e.g. still being
// onboarded, contract drafted before their first pay period) - callers then
// fall back to computeStatutoryDeductions() in statutoryDeductions.ts.
export async function fetchPayrollStatutoryLine(
  companyId: string | number | null | undefined,
  individualId: number | null | undefined
): Promise<StatutoryDeductionsBreakdown | null> {
  if (companyId == null || individualId == null) return null;

  // Only runs that actually represent real payroll (exclude cancelled/
  // reversed ones) are candidates - a line under one of those never
  // reflects what the employee was actually paid.
  const { data: runs, error: runsError } = await supabase
    .from('bcl_payroll_runs')
    .select('id')
    .eq('company_id', companyId)
    .not('status', 'in', '(cancelled,reversed)');

  if (runsError || !runs || runs.length === 0) return null;

  const runIds = runs.map((r: { id: string }) => r.id);

  // Most recently created line for this employee among those runs - a
  // reasonable proxy for "most recent pay period" without needing to join
  // back to bcl_payroll_runs for period_year/period_month ordering.
  const { data: line, error: lineError } = await supabase
    .from('bcl_payroll_run_lines')
    .select('gross_pay, chargeable_pay, paye, shif, ahl_employee, nssf_employee, nita, net_pay')
    .eq('individual_id', individualId)
    .eq('company_id', companyId)
    .in('run_id', runIds)
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lineError || !line) return null;

  return {
    grossSalary: Number(line.gross_pay) || 0,
    taxablePay: Number(line.chargeable_pay) || 0,
    paye: Number(line.paye) || 0,
    shif: Number(line.shif) || 0,
    ahl: Number(line.ahl_employee) || 0,
    nssf: Number(line.nssf_employee) || 0,
    nita: Number(line.nita) || 0,
    totalDeductions: (Number(line.paye) || 0) + (Number(line.shif) || 0) + (Number(line.ahl_employee) || 0) + (Number(line.nssf_employee) || 0),
    netPay: Number(line.net_pay) || 0,
  };
}
