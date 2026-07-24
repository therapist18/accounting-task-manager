import { useEffect, useState } from 'react';
import supabase from '@/lib/supabase/client';
import { EcPlaceholder, fetchPlaceholders } from '../utils/ecPlaceholders';
import { resolveMasterFieldValues } from '../utils/masterFieldResolver';
import type { JobField } from '../../master-fields/components/types/database';

// Shared by ContractEditor.tsx and ContractPreview.tsx so both resolve
// linked master-field placeholder values identically - whatever the editor
// shows in its Placeholders & Values tab is exactly what the preview/final
// document will render, no separate resolution paths to drift apart.
export function useMasterFieldValues(
  individualId: number | null | undefined,
  companyId: string | number | null | undefined
) {
  const [ecPlaceholders, setEcPlaceholders] = useState<EcPlaceholder[]>([]);
  const [masterFieldValues, setMasterFieldValues] = useState<Record<string, string>>({});

  useEffect(() => {
    fetchPlaceholders().then(setEcPlaceholders);
  }, []);

  useEffect(() => {
    async function resolve() {
      const linkedIds = Array.from(new Set(
        ecPlaceholders
          .filter((p) => p.source_kind === 'master_field' && p.master_field_id)
          .map((p) => p.master_field_id as string)
      ));
      if (linkedIds.length === 0 || individualId == null) {
        setMasterFieldValues({});
        return;
      }
      const { data: fields, error } = await supabase.from('tm_job_fields').select('*').in('id', linkedIds);
      if (error || !fields) {
        setMasterFieldValues({});
        return;
      }
      const values = await resolveMasterFieldValues(fields as JobField[], individualId, companyId);
      setMasterFieldValues(values);
    }
    resolve();
  }, [ecPlaceholders, individualId, companyId]);

  return { ecPlaceholders, masterFieldValues };
}
