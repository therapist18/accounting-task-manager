import supabase from '@/lib/supabase/client';

export interface CompanyDirectorOption {
  id: number;
  full_name: string;
}

// Same query shape as NewCompanyInquiryDialog.tsx's fetchOfficials (directors
// live as JSON entries inside registry_individuals.employment_data.associations,
// not a dedicated table) - reused here rather than a second re-derivation of
// that association-filtering logic, scoped down to just current Directors
// (EC only needs a signatory, not the full officials/shareholders list with
// photos that dialog also builds).
export async function fetchCompanyDirectors(companyId: number | string): Promise<CompanyDirectorOption[]> {
  const { data, error } = await supabase
    .from('registry_individuals')
    .select('id, full_name, employment_data')
    .order('full_name');
  if (error || !data) return [];

  const directors: CompanyDirectorOption[] = [];
  for (const individual of data as any[]) {
    const associations = individual.employment_data?.associations || [];
    const isDirector = associations.some((assoc: any) =>
      String(assoc.company_id) === String(companyId) &&
      assoc.individual_type === 'Director' &&
      assoc.is_current === true
    );
    if (isDirector) directors.push({ id: individual.id, full_name: individual.full_name });
  }
  return directors;
}

export async function updateCompanySignatory(companyId: number | string, individualId: number | null): Promise<boolean> {
  const { error } = await supabase
    .from('acc_portal_company_duplicate')
    .update({ signatory_individual_id: individualId })
    .eq('id', companyId);
  return !error;
}

export async function fetchSignatoryName(individualId: number | string | null | undefined): Promise<string> {
  if (individualId == null) return '';
  const { data, error } = await supabase
    .from('registry_individuals')
    .select('full_name')
    .eq('id', individualId)
    .maybeSingle();
  if (error || !data) return '';
  return data.full_name || '';
}
