import supabase from '@/lib/supabase/client';
import { fetchSignatoryName } from './companySignatory';

// One row per company, holding Employment Contract Engine config that's
// company-wide rather than tied to any single Job Profile - see
// 20260731000005_ec_company_settings.sql for why this lives in its own
// table instead of on either ec_job_profiles (Company/Department Defaults
// scopes are retired) or the shared acc_portal_company_duplicate table.
export interface EcCompanySettings {
  id: string;
  company_id: string;
  signatory_individual_id: number | null;
  job_levels: string[];
  employment_types: string[];
  departments: string[];
  created_at: string;
  updated_at: string;
}

export async function fetchCompanySettings(companyId: string | number | null | undefined): Promise<EcCompanySettings | null> {
  if (companyId == null) return null;
  const { data, error } = await supabase
    .from('ec_company_settings')
    .select('*')
    .eq('company_id', String(companyId))
    .maybeSingle();
  if (error || !data) return null;
  return data as EcCompanySettings;
}

// Upsert rather than update - most companies won't have a row yet (the
// table only grows one the first time any of these settings gets touched),
// so every write here has to work whether or not fetchCompanySettings found
// anything first.
export async function upsertCompanySettings(
  companyId: string | number,
  patch: Partial<Pick<EcCompanySettings, 'signatory_individual_id' | 'job_levels' | 'employment_types' | 'departments'>>
): Promise<boolean> {
  const { error } = await supabase
    .from('ec_company_settings')
    .upsert({ company_id: String(companyId), ...patch, updated_at: new Date().toISOString() }, { onConflict: 'company_id' });
  return !error;
}

// Convenience for ContractEditor.tsx/ContractPreview.tsx, which only need
// the resolved name string, not the settings row or a second manual step to
// look up the individual.
export async function fetchSignatoryNameForCompany(companyId: string | number | null | undefined): Promise<string> {
  const settings = await fetchCompanySettings(companyId);
  return fetchSignatoryName(settings?.signatory_individual_id);
}

// Distinct, non-empty department names actually in use by this company's
// employees (registry_employees.department) - the same source Payroll's own
// company-structure endpoint reads for its department list
// (E:\GitHub\Payroll\app\api\companies\[id]\structure\route.ts), so the two
// apps see the same real-world departments instead of each maintaining an
// independent guess. Used by the Job Profiles page's "Company Details/
// Defaults" tab to let a user populate the Departments vocabulary list from
// what employees are actually tagged with, instead of typing it from
// scratch - it only suggests values, it never overwrites the saved list
// itself (that still requires the explicit "Save Lists" action).
export async function fetchCompanyDepartmentsFromEmployees(companyId: string | number | null | undefined): Promise<string[]> {
  if (companyId == null) return [];
  const { data, error } = await supabase
    .from('registry_employees')
    .select('department')
    .eq('company_id', companyId);
  if (error || !data) return [];

  const seen = new Map<string, string>(); // lowercased -> first-seen casing
  for (const row of data) {
    const dept = (row.department || '').trim();
    if (!dept) continue;
    const key = dept.toLowerCase();
    if (!seen.has(key)) seen.set(key, dept);
  }
  return Array.from(seen.values()).sort((a, b) => a.localeCompare(b));
}
