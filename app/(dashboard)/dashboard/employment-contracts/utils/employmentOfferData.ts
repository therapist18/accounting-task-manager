import supabase from '@/lib/supabase/client';

export interface EmploymentOffer {
  id: string;
  job_profile_id: string;
  company_id: string;
  individual_id: number;
  basic_salary: number | null;
  currency: string;
  allowances: { label: string; amount?: number }[];
  start_date: string | null;
  end_date: string | null;
  settings_overrides: Record<string, any>;
  section_clauses_overrides: Record<string, string>;
  // Per-contract {{token}} value overrides (identity, working hours,
  // benefits, leave, ...) - see standardPlaceholders.ts. Distinct from
  // settings_overrides, which only feeds the settings cascade and can be
  // shadowed by computed identity fields; this always wins.
  placeholder_overrides: Record<string, string>;
  status: 'draft' | 'active' | 'superseded';
  created_at: string;
  updated_at: string;
}

// One employee can only usefully have one live offer at a time for this
// screen - the most recently updated non-superseded offer is "the" offer.
export async function fetchLatestOffer(companyId: string | number, individualId: number): Promise<EmploymentOffer | null> {
  const { data, error } = await supabase
    .from('ec_employment_offers')
    .select('*')
    .eq('company_id', String(companyId))
    .eq('individual_id', individualId)
    .neq('status', 'superseded')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('Error fetching employment offer:', error);
    return null;
  }
  return data as EmploymentOffer | null;
}

// Every person in the company with a saved (non-superseded) offer, latest
// offer per person - the source list for "Copy contract from...".
export async function fetchCompanyOffers(companyId: string | number): Promise<EmploymentOffer[]> {
  const { data, error } = await supabase
    .from('ec_employment_offers')
    .select('*')
    .eq('company_id', String(companyId))
    .neq('status', 'superseded')
    .order('updated_at', { ascending: false });

  if (error) {
    console.error('Error fetching company employment offers:', error);
    return [];
  }
  const latestPerPerson = new Map<number, EmploymentOffer>();
  for (const offer of (data || []) as EmploymentOffer[]) {
    if (!latestPerPerson.has(offer.individual_id)) latestPerPerson.set(offer.individual_id, offer);
  }
  return Array.from(latestPerPerson.values());
}

// Builds the target person's draft offer from another person's saved one.
// Copied: the contract terms - job profile, clause/settings overrides,
// currency, allowances, dates, and per-contract values for settings_cascade
// placeholders (probation/notice periods, contract dates, ...).
// Not copied: anything about the source person - overrides for master_field
// placeholders (name, ID, KRA PIN, address, ... come from each person's own
// record), and basic_salary (the target keeps their own payroll figure).
// No id/created_at either: Generate updates whatever offer.id it holds, so
// carrying the source's id would overwrite the source person's contract.
export function copyOfferToIndividual(
  source: EmploymentOffer,
  target: { individualId: number; companyId: string | number; basicSalary?: number | null },
  settingsPlaceholderKeys: Set<string>
): Partial<EmploymentOffer> {
  const placeholderOverrides: Record<string, string> = {};
  for (const [key, value] of Object.entries(source.placeholder_overrides || {})) {
    if (settingsPlaceholderKeys.has(key)) placeholderOverrides[key] = value;
  }
  return {
    job_profile_id: source.job_profile_id,
    company_id: String(target.companyId),
    individual_id: target.individualId,
    basic_salary: target.basicSalary || null,
    currency: source.currency,
    allowances: source.allowances || [],
    start_date: source.start_date,
    end_date: source.end_date,
    settings_overrides: { ...(source.settings_overrides || {}) },
    section_clauses_overrides: { ...(source.section_clauses_overrides || {}) },
    placeholder_overrides: placeholderOverrides,
    status: 'draft',
  };
}

export async function createEmploymentOffer(offer: Partial<EmploymentOffer>): Promise<EmploymentOffer | null> {
  const { data, error } = await supabase
    .from('ec_employment_offers')
    .insert([offer])
    .select()
    .single();

  if (error) {
    console.error('Error creating employment offer:', error);
    return null;
  }
  return data as EmploymentOffer;
}

export async function updateEmploymentOffer(id: string, patch: Partial<EmploymentOffer>): Promise<EmploymentOffer | null> {
  const { data, error } = await supabase
    .from('ec_employment_offers')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error updating employment offer:', error);
    return null;
  }
  return data as EmploymentOffer;
}
