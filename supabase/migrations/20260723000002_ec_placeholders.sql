-- Placeholder data-source registry for the Employment Contract Engine.
--
-- Mirrors how Document Template Manager already links a template's
-- placeholders to tm_job_fields (the "master fields" registry) instead of
-- hardcoding where each value comes from: a master field's own `sources`
-- column (table/path/priority/linking_variable) is the single source of
-- truth for "where does this fact live," reused here rather than duplicated.
--
-- Not every EC placeholder fits that shape though - only per-employee/
-- per-company identity facts (source_kind='master_field') are simple
-- table+path lookups. Working hours, benefits, leave, notice period, salary
-- etc. are the *output* of walking the Company -> Department -> Job Profile
-- -> Offer cascade (see resolveEffectiveSettings in utils/clauseEngine.ts) -
-- that cascade logic has no equivalent in tm_job_fields.sources, so those
-- stay tagged 'settings_cascade' / 'offer' and keep resolving the way they
-- already do in utils/standardPlaceholders.ts.
CREATE TABLE ec_placeholders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE, -- the {{token}} name, e.g. "employee_name"
  label TEXT NOT NULL,
  group_label TEXT NOT NULL, -- display grouping, e.g. "Employee Identity"
  source_kind TEXT NOT NULL CHECK (source_kind IN ('master_field', 'settings_cascade', 'offer')),
  -- Only set when source_kind = 'master_field'. Left NULL until linked via
  -- the Data Sources admin page - an unlinked master_field placeholder just
  -- falls back to the legacy hardcoded computation in standardPlaceholders.ts,
  -- so contracts never go blank mid-migration.
  master_field_id UUID REFERENCES tm_job_fields(id) ON DELETE SET NULL,
  -- Only set when source_kind = 'settings_cascade' - the key read off the
  -- resolved effective settings bag.
  settings_key TEXT,
  -- Only set when source_kind = 'offer' - the column read off ec_employment_offers.
  offer_field TEXT,
  -- Whether this token can be overridden per-contract via
  -- ec_employment_offers.placeholder_overrides (see ContractEditor.tsx's
  -- Placeholders & Values tab). False for fields that already have a
  -- dedicated editor (Offer Adjustments card) to avoid two controls fighting
  -- over one value.
  editable BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ec_placeholders_source_kind_idx ON ec_placeholders (source_kind);
CREATE INDEX ec_placeholders_master_field_id_idx ON ec_placeholders (master_field_id) WHERE master_field_id IS NOT NULL;
