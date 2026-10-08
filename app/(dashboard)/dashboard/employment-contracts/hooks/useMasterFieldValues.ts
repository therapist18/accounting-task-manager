import { useCallback, useEffect, useRef, useState } from 'react';
import { EcPlaceholder, fetchPlaceholders } from '../utils/ecPlaceholders';
import { fetchEcData, resolveEcPlaceholders } from '../utils/ecResolver';
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
  // Tags each refresh() call so a slow, superseded call (e.g. the user
  // switched employees again before the first fetch landed) can detect
  // it's stale and skip applying its result instead of clobbering the
  // newer one.
  const requestIdRef = useRef(0);

  // refresh() re-fetches ec_placeholders (in case a placeholder was newly
  // linked to a master field on the Data Sources admin page, which this
  // component has no other way to learn about) and re-resolves every
  // value from scratch, then applies both to state. It's a plain async
  // function (not the earlier refreshKey-bump-and-let-effects-catch-up
  // shape) specifically so callers - the manual "Refresh" button and the
  // post-save-to-source callback - can await it and know once the new
  // data has actually landed, e.g. to show a success toast.
  const refresh = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    const placeholders = await fetchPlaceholders();
    if (requestId !== requestIdRef.current) return;
    setEcPlaceholders(placeholders);

    // Company-scoped placeholders need nothing but the company id, so only
    // bail when there's no scope at all: an external person (guest mode -
    // utils/guestPerson.ts) has no individual id until "Save person to
    // registry", but the company selected for them must still populate every
    // company-dependent placeholder. fetchEcData/resolveEcPlaceholders both
    // handle a null individual as long as a company id is present -
    // individual-scoped links simply resolve to nothing until the person
    // exists.
    if (individualId == null && companyId == null) {
      setMasterFieldValues({});
      setMasterFields(new Map());
      return;
    }

    setIsResolving(true);
    try {
      const { combinedCache, masterFields: fields } = await fetchEcData(placeholders, individualId, companyId);
      if (requestId !== requestIdRef.current) return;
      const values = resolveEcPlaceholders(placeholders, individualId, companyId, combinedCache, fields);
      setMasterFieldValues(values);
      setMasterFields(fields);
    } finally {
      if (requestId === requestIdRef.current) setIsResolving(false);
    }
  }, [individualId, companyId]);

  useEffect(() => {
    refresh();
    // refresh's own identity already changes with individualId/companyId,
    // so depending on it alone re-runs this on every relevant change.
  }, [refresh]);

  return { ecPlaceholders, masterFieldValues, masterFields, isResolving, refresh };
}
