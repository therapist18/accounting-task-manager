import { useState, useEffect } from 'react';
import supabase from '@/lib/supabase/client';

const NATIONAL_ID_DOC_ID = '401603c9-0acb-46a7-aa08-ceb5ee4a86df';
const ALIEN_ID_DOC_ID = '579a0a70-fb18-4636-8e49-3cde98f29677';

export interface IndividualIdentificationNumbers {
  id_number: string;
  alien_number: string;
}

export interface IndividualIdInfo {
  label: string;
  value: string;
}

export function resolveIndividualId(ids: IndividualIdentificationNumbers | undefined): IndividualIdInfo | null {
  if (!ids) return null;
  if (ids.id_number) return { label: 'ID No', value: ids.id_number };
  if (ids.alien_number) return { label: 'Alien No', value: ids.alien_number };
  return null;
}

export const useIndividualIdentificationNumbers = (individualIds: (string | number)[]) => {
  const [identificationNumbers, setIdentificationNumbers] = useState<Record<string | number, IndividualIdentificationNumbers>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchIdentificationNumbers = async () => {
      const uniqueIds = Array.from(new Set(individualIds.filter(Boolean)));
      if (uniqueIds.length === 0) {
        setIdentificationNumbers({});
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const { data: documents, error } = await supabase
          .from('acc_portal_directors_documents')
          .select('*')
          .in('director_id', uniqueIds)
          .in('document_id', [NATIONAL_ID_DOC_ID, ALIEN_ID_DOC_ID]);

        if (error) throw error;

        const docsByKey = new Map<string, any[]>();
        documents?.forEach(doc => {
          const key = `${doc.director_id}-${doc.document_id}`;
          if (!docsByKey.has(key)) docsByKey.set(key, []);
          docsByKey.get(key)!.push(doc);
        });

        const selectedDocs: any[] = [];
        docsByKey.forEach(docs => {
          const sorted = docs.sort((a, b) => {
            const dateA = a.isEffectiveTo ? new Date(a.isEffectiveTo).getTime() : 0;
            const dateB = b.isEffectiveTo ? new Date(b.isEffectiveTo).getTime() : 0;
            return dateB - dateA;
          });
          selectedDocs.push(sorted[0]);
        });

        const docMap = new Map<string | number, IndividualIdentificationNumbers>();
        selectedDocs.forEach(doc => {
          if (!docMap.has(doc.director_id)) {
            docMap.set(doc.director_id, { id_number: '', alien_number: '' });
          }
          const entry = docMap.get(doc.director_id)!;
          if (doc.document_id === ALIEN_ID_DOC_ID) {
            entry.alien_number =
              doc.extracted_details?.['INDV. Number'] ||
              doc.extracted_details?.Indiv_Number ||
              '';
          } else if (doc.document_id === NATIONAL_ID_DOC_ID) {
            entry.id_number =
              doc.extracted_details?.id_number ||
              doc.extracted_details?.['ID Number'] ||
              doc.extracted_details?.ID_Number ||
              '';
          }
        });

        const result: Record<string | number, IndividualIdentificationNumbers> = {};
        uniqueIds.forEach(id => {
          result[id] = docMap.get(id) || { id_number: '', alien_number: '' };
        });

        setIdentificationNumbers(result);
      } catch (err) {
        console.error('Error fetching individual identification numbers:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchIdentificationNumbers();
  }, [individualIds.join(',')]);

  return { identificationNumbers, loading };
};
