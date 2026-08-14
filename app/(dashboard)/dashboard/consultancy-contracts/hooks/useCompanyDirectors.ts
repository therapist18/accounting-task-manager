import { useEffect, useMemo, useState } from 'react';
import { fetchIndividuals, type Individual } from '../../individuals/database';

export interface CompanyDirector {
  id: string;
  name: string;
  position: string;
}

// Same director/shareholder filter the Letter Generation Engine applies in
// letters/hooks/useLetterData.ts's availableSignatories - an individual only
// qualifies if one of their employment_data.associations ties them to the
// selected company with an individual_type containing "director" or
// "shareholder" (employees/principals are excluded). Kept as its own hook
// (not a shared import) since Letters' version is bundled together with its
// signature-scan lookup, which this module has no use for.
export function useCompanyDirectors(companyId: string | null) {
  const [individuals, setIndividuals] = useState<Individual[]>([]);

  useEffect(() => {
    fetchIndividuals()
      .then(setIndividuals)
      .catch((e) => console.error('Failed to fetch individuals for directors picker:', e));
  }, []);

  const directors = useMemo<CompanyDirector[]>(() => {
    if (!companyId) return [];
    return individuals
      .map((ind) => {
        const associations = ind.employment_data?.associations?.filter(
          (assoc) => assoc.company_id?.toString() === companyId
        ) || [];
        const validAssociation = associations.find((a) => {
          const type = a.individual_type?.toLowerCase() || '';
          return type.includes('director') || type.includes('shareholder');
        });
        if (!validAssociation) return null;
        return {
          id: String(ind.id),
          name: ind.full_name || 'Unknown',
          position: validAssociation.individual_type || 'Director',
        };
      })
      .filter((d): d is CompanyDirector => d !== null);
  }, [companyId, individuals]);

  return { directors };
}
