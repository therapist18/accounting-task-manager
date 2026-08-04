-- Company-wide Employment Contract Engine settings that don't belong on any
-- single Job Profile (Company/Department Defaults scopes are retired - see
-- the comment in job-profiles/page.tsx's handleCreate - every profile is now
-- scope: 'position', so there's no "Company Defaults profile" to hang these
-- off of anymore). Also deliberately NOT added as columns on the shared
-- acc_portal_company_duplicate table (used across the whole app, not just
-- Employment Contracts) - EC's own config stays in EC's own schema.
--
-- signatory_individual_id replaces a same-named column this session
-- initially added directly on acc_portal_company_duplicate - wrong table for
-- an EC-only concern. That migration (20260731000004) was deleted outright
-- rather than left in the repo, since it was never applied to any database
-- yet (this app's migrations get committed as files well before they're
-- actually run - see prior migrations' commit history for the same pattern).
--
-- job_levels/employment_types/departments: the fixed global option lists in
-- utils/profileOptions.ts don't fit every company's own terminology - these
-- let each company define its own vocabulary, with the Job Profile editor's
-- pickers falling back to the global defaults when a company hasn't
-- configured its own list yet (see withCurrentValue's existing pattern for
-- why an empty/unconfigured list doesn't just break the picker).
CREATE TABLE ec_company_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id TEXT NOT NULL UNIQUE,
  signatory_individual_id BIGINT REFERENCES registry_individuals(id) ON DELETE SET NULL,
  job_levels TEXT[] NOT NULL DEFAULT '{}',
  employment_types TEXT[] NOT NULL DEFAULT '{}',
  departments TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ec_company_settings_company_id_idx ON ec_company_settings (company_id);
