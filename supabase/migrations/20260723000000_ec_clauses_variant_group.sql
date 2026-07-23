-- Clause variants: lets several ec_clauses rows for the same section be
-- authored as alternatives of one conceptual component (e.g. "Office Hours"
-- vs "Shift Hours" vs "Remote Hours" all under the working_hours section)
-- instead of reading as unrelated flat cards in the Clause Library.
--
-- Deliberately additive and non-breaking: contract assembly still resolves
-- exactly one clause id per section (see resolveEffectiveClauses /
-- assembleContractHtml in utils/clauseEngine.ts) - variant_group is purely
-- an authoring-time grouping label, not a new resolution concept. Clauses
-- with a NULL variant_group behave exactly as before (standalone card).
ALTER TABLE ec_clauses ADD COLUMN variant_group TEXT;

CREATE INDEX ec_clauses_variant_group_idx
  ON ec_clauses (section_key, variant_group)
  WHERE variant_group IS NOT NULL;
