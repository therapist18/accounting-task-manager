-- Consultancy Contracts module: generates the Booksmart Consultancy Limited
-- (BCL) <-> client Bookkeeping/Accountancy/Tax Consultancy Agreement.
--
-- Deliberately NOT a clause-variant engine like ec_clauses/ec_job_profiles -
-- BCL sends every client the same generic agreement, so there is exactly one
-- standard document (cc_templates, normally a single row) rather than a
-- cascade of company/department/position profiles. There is also no employee
-- dimension: the counterpart to BCL is always the client company itself, so
-- cc_engagements (this module's equivalent of ec_employment_offers) is keyed
-- by company_id only.
--
-- No cc_placeholders table: this module deliberately reuses ec_placeholders
-- (Employment Contracts' registry) instead of a parallel one. Company-level
-- facts a contract needs - company_name, company_kra_pin, company_address,
-- company_registration_number - are already registered there, entity_type
-- 'company', pointing at the same tm_job_fields this module also reads (see
-- 20260731000002_ec_placeholder_entity_types.sql). Reusing those rows means
-- linking a master field once serves both contract types, and there's no
-- risk of the two registries' company data drifting apart. Tokens with no EC
-- equivalent (fees, signatory, contract ref, effective date) get their own
-- new ec_placeholders rows instead (group_label = 'Consultancy Contract',
-- source_kind = 'master_field' with master_field_id left NULL - the same
-- "not linked yet, resolves from default/override" convention EC's own
-- unlinked placeholders already use - see 20260813000001_seed_cc_template_and_placeholders.sql).
-- app/(dashboard)/dashboard/consultancy-contracts/utils/placeholderDetection.ts
-- checks ec_placeholders for an existing key before inserting a new one, so a
-- token this module shares with EC (e.g. company_kra_pin) is never duplicated.

-- 1. The standard document: HTML content with inline {{tokens}}, authored via
-- the shared TemplateEditor (components/TemplateEditor.tsx). Expected to
-- normally hold exactly one row; kept as a table (not a singleton constant)
-- so it stays admin-editable from Settings without a code deploy.
CREATE TABLE cc_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL DEFAULT 'Standard Bookkeeping & Consultancy Agreement',
  content TEXT NOT NULL DEFAULT '',
  theme_settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_default BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Engagements: one row per client company - this module's "contract
-- instance," mirroring ec_employment_offers minus the employee dimension.
-- "Latest non-superseded row for a company" is the live engagement, same
-- lookup pattern as employmentOfferData.ts' fetchLatestOffer.
CREATE TABLE cc_engagements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id TEXT NOT NULL,
  template_id UUID REFERENCES cc_templates(id) ON DELETE SET NULL,
  placeholder_overrides JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'superseded')),
  effective_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX cc_engagements_company_id_idx ON cc_engagements (company_id);
