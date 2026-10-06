import { useCallback, useEffect, useMemo, useState } from 'react';
import { LETTER_TEMPLATES, linkedLetterPlaceholders, type LetterTemplate } from '../utils/letterTemplates';
import { loadLetterCatalog } from '../utils/letterTemplateStore';
import { fetchCcData, resolveCcPlaceholders } from '../../consultancy-contracts/utils/ccResolver';

const todayIso = () => new Date().toISOString().slice(0, 10);

export type DocumentTab = 'contract' | 'letters';

// Letter state for the Employment Contracts workspace - owned by page.tsx and
// shared by ContractEditor (Letters tab) and ContractPreview (renders the
// selected letter), the same way contractData is shared between them.
//
// values = placeholder defaults (letter_date = today)
//        < values resolved from the template's master-field-linked
//          placeholders for the selected employee/company (ccResolver -
//          the same resolver consultancy templates use)
//        < whatever was typed in the Letter group.
export function useEmploymentLetters(individualId: number | null, companyId: string | null) {
  // Letter types + their default templates from the Letter Templates tab; the
  // standard set in code until those load (or when none exist yet).
  const [catalog, setCatalog] = useState<LetterTemplate[]>(LETTER_TEMPLATES);
  const [letterKey, setLetterKey] = useState<string>(LETTER_TEMPLATES[0].key);
  // Keyed by letter type so switching type and back keeps what was typed.
  const [valuesByType, setValuesByType] = useState<Record<string, Record<string, string>>>({});
  const [resolvedValues, setResolvedValues] = useState<Record<string, string>>({});

  useEffect(() => {
    loadLetterCatalog().then((letters) => {
      if (letters.length === 0) return;
      setCatalog(letters);
      setLetterKey((prev) => (letters.some((l) => l.key === prev) ? prev : letters[0].key));
    });
  }, []);

  const letter = catalog.find((t) => t.key === letterKey) || catalog[0];

  // Master-field-linked placeholders, resolved for the selected employee
  // (individual-scoped) and company (company-scoped).
  useEffect(() => {
    const linked = linkedLetterPlaceholders(letter);
    if (linked.length === 0 || individualId == null) { setResolvedValues({}); return; }
    let cancelled = false;
    const entityIds = [individualId, companyId].filter((v) => v != null) as (string | number)[];
    fetchCcData(linked, entityIds).then(({ combinedCache, masterFields }) => {
      if (cancelled) return;
      const relationshipData = {
        company: companyId ? { id: companyId } : null,
        directors: [],
        employees: [{ id: individualId }],
        principal: null, dependants: [], understudy: null, sponsor: null,
      };
      const values = resolveCcPlaceholders(
        linked, relationshipData, combinedCache, masterFields,
        { employee: String(individualId), individual: String(individualId), director: String(individualId) },
        [{ id: individualId, associations: [{ individual_type: 'employee' }] }],
      );
      setResolvedValues(values);
    }).catch((err) => {
      console.error('Error resolving letter placeholders:', err);
      if (!cancelled) setResolvedValues({});
    });
    return () => { cancelled = true; };
  }, [letter, individualId, companyId]);

  const values = useMemo(() => {
    const defaults: Record<string, string> = { letter_date: todayIso() };
    for (const p of letter.placeholders || []) {
      if (p.default_value) defaults[p.name] = p.default_value === 'today' ? todayIso() : p.default_value;
    }
    return { ...defaults, ...resolvedValues, ...(valuesByType[letterKey] || {}) };
  }, [letter, resolvedValues, valuesByType, letterKey]);

  const setValue = useCallback((key: string, value: string) => {
    setValuesByType((prev) => ({ ...prev, [letterKey]: { ...(prev[letterKey] || {}), [key]: value } }));
  }, [letterKey]);

  // Typed values belong to one employee's letter - cleared on switching employee.
  const reset = useCallback(() => setValuesByType({}), []);

  return { catalog, letter, letterKey, setLetterKey, values, setValue, reset };
}

export type EmploymentLetters = ReturnType<typeof useEmploymentLetters>;
