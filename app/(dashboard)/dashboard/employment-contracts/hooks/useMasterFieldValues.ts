import { useCallback, useEffect, useState } from 'react';
import { EcPlaceholder, fetchPlaceholders } from '../utils/ecPlaceholders';
import { resolveEcPlaceholderValues } from '../utils/masterFieldResolver';

// Shared by ContractEditor.tsx and ContractPreview.tsx so both resolve
// linked master-field placeholder values identically - whatever the editor
// shows in its Placeholders & Values tab is exactly what the preview/final
// document will render, no separate resolution paths to drift apart.
//
// masterFieldValues is keyed by ec_placeholders.key (not tm_job_fields.id) -
// resolveEcPlaceholderValues already resolves each placeholder's full
// priority-ordered master_field_links, so the caller never needs to know
// which underlying master field id won.
export function useMasterFieldValues(
  individualId: number | null | undefined,
  companyId: string | number | null | undefined
) {
  const [ecPlaceholders, setEcPlaceholders] = useState<EcPlaceholder[]>([]);
  const [masterFieldValues, setMasterFieldValues] = useState<Record<string, string>>({});
  const [isResolving, setIsResolving] = useState(false);
  // Bumping this re-runs both effects below - the manual "Refresh" button
  // exposed by refresh() exists because linking a placeholder to a master
  // field happens on a different page (Data Sources admin), so nothing here
  // would otherwise know the link changed until individualId/companyId
  // themselves change (e.g. switching employees).
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
        return;
      }
      setIsResolving(true);
      const values = await resolveEcPlaceholderValues(ecPlaceholders, individualId, companyId);
      if (!cancelled) setMasterFieldValues(values);
      setIsResolving(false);
    }
    resolve();
    return () => { cancelled = true; };
  }, [ecPlaceholders, individualId, companyId, refreshKey]);

  return { ecPlaceholders, masterFieldValues, isResolving, refresh };
}
