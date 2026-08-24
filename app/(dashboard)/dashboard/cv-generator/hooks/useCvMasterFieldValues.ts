import { useCallback, useEffect, useRef, useState } from "react";
import type { EcPlaceholder } from "../../employment-contracts/utils/ecPlaceholders";
import type { JobField } from "../../master-fields/components/types/database";
import { resolveCvMasterFieldValues } from "../utils/cvResolver";

// Same shape as employment-contracts/hooks/useMasterFieldValues.ts, but
// without a companyId - CV Generator never has one. Field links are
// configured on their own route (/dashboard/cv-generator/settings), so
// navigating there and back naturally remounts ContactEditor and re-fetches
// fresh links - no cross-component refresh signal needed.
export function useCvMasterFieldValues(individualId: number | null | undefined) {
  const [ecPlaceholders, setEcPlaceholders] = useState<EcPlaceholder[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [masterFields, setMasterFields] = useState<Map<number, JobField>>(new Map());
  const [isResolving, setIsResolving] = useState(false);
  const requestIdRef = useRef(0);

  const refresh = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setIsResolving(true);
    try {
      const result = await resolveCvMasterFieldValues(individualId);
      if (requestId !== requestIdRef.current) return;
      setEcPlaceholders(result.ecPlaceholders);
      setValues(result.values);
      setMasterFields(result.masterFields);
    } finally {
      if (requestId === requestIdRef.current) setIsResolving(false);
    }
  }, [individualId]);

  useEffect(() => {
    refresh();
    // refresh's own identity already changes with individualId, so
    // depending on it alone re-runs this on every relevant change.
  }, [refresh]);

  return { ecPlaceholders, values, masterFields, isResolving, refresh };
}
