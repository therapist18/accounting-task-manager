-- CV Generator's own, much smaller counterpart to ec_placeholders: the CV
-- Builder's Contact/Demographics fields are a fixed, code-defined set of ~11
-- scalar variables (see cv-generator/utils/cvFieldLinks.ts's
-- CV_MASTER_FIELD_VARIABLES), never an admin-extensible token vocabulary, so
-- there's no need for ec_placeholders' source_kind/settings_key/offer_field/
-- group_label columns - every row here is always resolved via master fields
-- (tm_job_fields), or stays unlinked and falls back to the CV Generator's
-- existing hardcoded Registry-import mapping (same "falls back to hardcoded
-- computation" guarantee ec_placeholders shipped with, see
-- 20260723000003_seed_ec_placeholders.sql).
CREATE TABLE cv_field_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  field_key TEXT NOT NULL UNIQUE,        -- 'personalInfo.fullName', 'personalDetails.nationality', etc.
  master_field_ids INTEGER[] NOT NULL DEFAULT '{}',  -- priority order = array order, first non-empty wins
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- No FK on the array column (Postgres can't FK into array elements) -
-- validated app-side, only ever written with ids from a live tm_job_fields
-- fetch. No RLS, matching ec_placeholders' own migration (this repo's
-- internal admin-config tables don't carry per-table RLS policies). Ships
-- empty - every CV variable starts unlinked.
