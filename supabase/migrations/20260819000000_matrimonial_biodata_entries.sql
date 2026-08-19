-- Per-individual saved state for Matrimonial Biodata: which theme is
-- selected, manual field overrides (keyed by placeholder name, the same
-- keying app/(dashboard)/dashboard/matrimonial-biodata/utils/biodataResolver.ts
-- resolves master-field values under), and chosen gallery images. Nothing
-- previously persisted this - biodataConfig used to be in-memory React state
-- lost on refresh/individual switch. One row per individual, mirroring how
-- Employment Contracts persists per-contract overrides on the offer row.
CREATE TABLE matrimonial_biodata_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  individual_id BIGINT NOT NULL REFERENCES registry_individuals(id) ON DELETE CASCADE,
  theme TEXT NOT NULL DEFAULT 'theme1',
  overrides JSONB NOT NULL DEFAULT '{}'::jsonb,
  images JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (individual_id)
);
