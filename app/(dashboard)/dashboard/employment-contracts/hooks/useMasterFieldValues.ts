import { useCallback, useEffect, useState } from 'react';
import { EcPlaceholder, fetchPlaceholders } from '../utils/ecPlaceholders';
import { resolveEcPlaceholderValues } from '../utils/masterFieldResolver';
import type { JobField } from '../../master-fields/components/types/database';

// Shared by ContractEditor.tsx and ContractPreview.tsx so both resolve
// linked master-field placeholder values identically - whatever the editor
// shows in its Data & Values panel is exactly what the preview/final
// document will render, no separate resolution paths to drift apart.
//
// masterFieldValues is keyed by ec_placeholders.key (not tm_job_fields.id) -
// resolveEcPlaceholderValues already resolves each placeholder's full
// priority-ordered master_field_links, so the caller never needs to know
// which underlying master field id won. masterFields (the raw JobField rows,
// keyed by tm_job_fields.id) is exposed alongside so ContractEditor.tsx's
// edit-and-save-to-source UI can inspect each linked field's own `sources`/
// `type`/`options` without a second duplicate fetch.
export function useMasterFieldValues(
  individualId: number | null | undefined,
  companyId: string | number | null | undefined
) {
  const [ecPlaceholders, setEcPlaceholders] = useState<EcPlaceholder[]>([]);
  const [masterFieldValues, setMasterFieldValues] = useState<Record<string, string>>({});
  const [masterFields, setMasterFields] = useState<Map<number, JobField>>(new Map());
  const [isResolving, setIsResolving] = useState(false);
  // Bumping this re-runs both effects below - the manual "Refresh" button
  // exposed by refresh() exists because linking a placeholder to a master
  // field happens on a different page (Data Sources admin), so nothing here
  // would otherwise know the link changed until individualId/companyId
  // themselves change (e.g. switching employees). Also called after a
  // successful save-to-source edit, so the newly-saved value reflects
  // immediately instead of showing the stale pre-edit one.
  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    fetchPlaceholders().then(setEcPlaceholders);
  }, [refreshKey]);

  useEffect(() => {
    let cancelled = false;
    async function resolve() {
      if (individualId == null) {
        setMasterFieldValues({});
        setMasterFields(new Map());
        return;
      }
      setIsResolving(true);
      const { values, masterFields: fields } = await resolveEcPlaceholderValues(ecPlaceholders, individualId, companyId);
      if (!cancelled) {
        setMasterFieldValues(values);
        setMasterFields(fields);
      }
      setIsResolving(false);
    }
    resolve();
    return () => { cancelled = true; };
  }, [ecPlaceholders, individualId, companyId, refreshKey]);

  return { ecPlaceholders, masterFieldValues, masterFields, isResolving, refresh };
}
