import { useEffect, useMemo, useState } from 'react';
import { fetchIndividuals, type Individual } from '../../individuals/database';
import type { CompanyDirector } from './useCompanyDirectors';

// Generalized version of useCompanyDirectors.ts's director/shareholder-only
// filter - matches a company's associated individuals against ANY set of
// entity_type strings (e.g. 'employee', 'hr', 'witness'), one bucket per type,
// same "individual_type contains X" convention useCompanyDirectors and
// letters/hooks/useLetterData.ts's availableSignatories both already use.
export function useCompanyIndividualsByType(companyId: string | null, types: string[]) {
  const [individuals, setIndividuals] = useState<Individual[]>([]);

  useEffect(() => {
    fetchIndividuals()
      .then(setIndividuals)
      .catch((e) => console.error('Failed to fetch individuals for entity-type pickers:', e));
  }, []);

  const typesKey = types.join('|');

  const byType = useMemo<Record<string, CompanyDirector[]>>(() => {
    const result: Record<string, CompanyDirector[]> = {};
    if (!companyId || types.length === 0) return result;

    types.forEach((t) => { result[t] = []; });

    individuals.forEach((ind) => {
      const associations = ind.employment_data?.associations?.filter(
        (assoc) => assoc.company_id?.toString() === companyId,
      ) || [];

      associations.forEach((assoc) => {
        const assocType = assoc.individual_type?.toLowerCase() || '';
        types.forEach((t) => {
          if (assocType.includes(t) && !result[t].some((d) => d.id === String(ind.id))) {
            result[t].push({
              id: String(ind.id),
              name: ind.full_name || 'Unknown',
              position: assoc.individual_type || t,
            });
          }
        });
      });
    });

    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, individuals, typesKey]);

  // Raw individuals scoped to this company, each carrying only ITS
  // associations with this company - the exact shape getTargetEntity/
  // getCompanyRegistryCandidates expect for their `companyAssociates` param
  // (see tasks-requirements/TemplateGenerationDialog.tsx:995-1015, which
  // fetches+shapes registry_individuals the same way for its own entity
  // pickers). This is what lets a Consultant placeholder resolve by explicit
  // id (getTargetEntity's generic id-lookup branch) AND lets any entity_type
  // with no dedicated relationshipData bucket (hr, accountant, manager, etc.)
  // still fall back to a role-matched candidate when nothing's picked yet.
  const companyAssociates = useMemo(() => {
    if (!companyId) return [] as Array<Individual & { associations: NonNullable<Individual['employment_data']>['associations'] }>;
    return individuals
      .map((ind) => {
        const associations = (ind.employment_data?.associations || []).filter(
          (a) => a.company_id?.toString() === companyId,
        );
        return associations.length > 0 ? { ...ind, associations } : null;
      })
      .filter(Boolean) as Array<Individual & { associations: NonNullable<Individual['employment_data']>['associations'] }>;
  }, [companyId, individuals]);

  return { individualsByType: byType, companyAssociates };
}
