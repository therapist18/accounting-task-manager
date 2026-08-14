import supabase from '@/lib/supabase/client';

export interface CcEngagement {
  id: string;
  company_id: string;
  template_id: string | null;
  // Per-company {{token}} value overrides - the only per-company
  // customization this module supports (see plan: "placeholder values only").
  placeholder_overrides: Record<string, string>;
  // Which of the company's director/shareholder associations (registry_
  // individuals ids, as strings) are party to the Acknowledgement section -
  // see hooks/useCompanyDirectors.ts and utils/directorsBlock.ts.
  selected_director_ids: string[];
  status: 'draft' | 'active' | 'superseded';
  effective_date: string | null;
  created_at: string;
  updated_at: string;
}

// One company can only usefully have one live engagement at a time for this
// screen - mirrors employment-contracts/utils/employmentOfferData.ts'
// fetchLatestOffer, just without the individual_id dimension.
export async function fetchLatestEngagement(companyId: string | number): Promise<CcEngagement | null> {
  const { data, error } = await supabase
    .from('cc_engagements')
    .select('*')
    .eq('company_id', String(companyId))
    .neq('status', 'superseded')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('Error fetching consultancy engagement:', error);
    return null;
  }
  return data as CcEngagement | null;
}

export async function createEngagement(engagement: Partial<CcEngagement>): Promise<CcEngagement | null> {
  const { data, error } = await supabase
    .from('cc_engagements')
    .insert([engagement])
    .select()
    .single();

  if (error) {
    console.error('Error creating consultancy engagement:', error);
    return null;
  }
  return data as CcEngagement;
}

export async function updateEngagement(id: string, patch: Partial<CcEngagement>): Promise<CcEngagement | null> {
  const { data, error } = await supabase
    .from('cc_engagements')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error updating consultancy engagement:', error);
    return null;
  }
  return data as CcEngagement;
}
