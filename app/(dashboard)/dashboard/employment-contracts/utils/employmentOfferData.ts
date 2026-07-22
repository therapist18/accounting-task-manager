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
