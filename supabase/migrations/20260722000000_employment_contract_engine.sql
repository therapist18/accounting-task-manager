-- Employment Contract Engine: clause-driven contract generation.
-- Net-new, ec_-prefixed tables only. Nothing existing is altered.
-- See plan: Employment Contract Engine - Clause-Driven Rearchitecture.
--
-- 4 tables, not 6: suggestion rules live as jsonb columns on ec_clauses
-- (they have no independent identity - only read when authoring a profile),
-- and the Company/Department settings cascade is folded into ec_job_profiles
-- via a `scope` column rather than a separate ec_org_defaults table, since
-- Company/Department Defaults are the same settings+section_clauses shape
-- as a Job Profile, just less specific. Employment Offers stay a separate
-- table deliberately - it's a mutable per-hire instance record with its own
-- lifecycle, not another cascade layer of the same reusable-template kind.

-- 1. Clause library: reusable content per standard contract section, plus
-- inline "suggest this clause when..." metadata used only when authoring a
-- Job Profile (see ec_job_profiles.section_clauses below).
CREATE TABLE ec_clauses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section_key TEXT NOT NULL,
  clause_key TEXT NOT NULL,
  label TEXT NOT NULL,
  content TEXT NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT false,
  company_id TEXT, -- null = shared/global clause, usable by any company
  suggest_conditions JSONB NOT NULL DEFAULT '[]'::jsonb, -- [{employment_type?, job_level?, work_arrangement?, department?}]
  suggest_priority INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (section_key, clause_key, company_id)
);
CREATE INDEX ec_clauses_section_key_idx ON ec_clauses (section_key);
CREATE INDEX ec_clauses_company_id_idx ON ec_clauses (company_id);

-- 2. Job Profiles: the settings cascade AND the reusable "job package", at
-- three specificity levels distinguished by `scope`:
--   'company'    - company_id only. The whole-company defaults.
--   'department' - company_id + department. Department-level overrides.
--   'position'   - the actual assignable profile (e.g. "Accountant -
--                  Permanent - Finance - JG3"), what the Susan/John scenario
--                  reuses across employees.
-- Resolution walks company -> department -> position, shallow-merging
-- .settings / .section_clauses at each level (see utils/clauseEngine.ts).
CREATE TABLE ec_job_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope TEXT NOT NULL DEFAULT 'position' CHECK (scope IN ('company', 'department', 'position')),
  company_id TEXT NOT NULL,
  name TEXT NOT NULL,
  department TEXT,
  job_title TEXT,
  employment_type TEXT,
  job_level TEXT,
  work_arrangement TEXT,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  section_clauses JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ec_job_profiles_company_scope_shape
    CHECK (scope <> 'company' OR (department IS NULL AND job_title IS NULL AND employment_type IS NULL AND job_level IS NULL)),
  CONSTRAINT ec_job_profiles_department_scope_shape
    CHECK (scope <> 'department' OR (department IS NOT NULL AND job_title IS NULL AND employment_type IS NULL AND job_level IS NULL))
);
CREATE INDEX ec_job_profiles_company_id_idx ON ec_job_profiles (company_id);
CREATE INDEX ec_job_profiles_match_idx ON ec_job_profiles (company_id, department, job_title, employment_type);
-- At most one company-defaults row per company, one department-defaults row
-- per (company, department); no such constraint on 'position' rows - a
-- company can have many position profiles.
CREATE UNIQUE INDEX ec_job_profiles_company_scope_key
  ON ec_job_profiles (company_id) WHERE scope = 'company';
CREATE UNIQUE INDEX ec_job_profiles_department_scope_key
  ON ec_job_profiles (company_id, department) WHERE scope = 'department';

-- 3. Employment Offers: applies a Job Profile (scope='position') to one
-- hire, with overrides. Deliberately its own table, not another cascade
-- level in ec_job_profiles - this is a mutable per-employee instance with a
-- lifecycle (draft/active/superseded), not a reusable template.
CREATE TABLE ec_employment_offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_profile_id UUID NOT NULL REFERENCES ec_job_profiles(id) ON DELETE RESTRICT,
  company_id TEXT NOT NULL,
  individual_id BIGINT NOT NULL,
  basic_salary NUMERIC(14, 2),
  currency TEXT NOT NULL DEFAULT 'KES',
  allowances JSONB NOT NULL DEFAULT '[]'::jsonb,
  start_date DATE,
  end_date DATE,
  settings_overrides JSONB NOT NULL DEFAULT '{}'::jsonb,
  section_clauses_overrides JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'superseded')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ec_employment_offers_individual_idx ON ec_employment_offers (company_id, individual_id);
CREATE INDEX ec_employment_offers_job_profile_idx ON ec_employment_offers (job_profile_id);

-- 4. Contract Templates: theme + which/what-order of the 17 standard
-- sections. Kept separate from ec_job_profiles on purpose - presentation
-- (fonts, margins, header, signature layout) is a different concern from
-- business content and the user's own spec keeps Theme as its own layer.
CREATE TABLE ec_contract_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id TEXT, -- null = platform default, usable by any company
  name TEXT NOT NULL,
  section_keys JSONB NOT NULL DEFAULT '[]'::jsonb,
  theme_settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  branding_strategy TEXT NOT NULL DEFAULT 'theme_header',
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ec_contract_templates_company_id_idx ON ec_contract_templates (company_id);
