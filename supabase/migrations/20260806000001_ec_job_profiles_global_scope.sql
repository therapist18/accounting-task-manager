-- Allows ec_job_profiles.company_id to be NULL, meaning a Global/Generic
-- profile usable by any company - mirrors the existing null = shared/global
-- pattern already used by ec_clauses.company_id and
-- ec_contract_templates.company_id. Used as the Job Profile dropdown
-- fallback in ContractEditor when a company has none of its own
-- position-scope profiles, and backs the "General (No Company)" workspace
-- in the Job Profiles admin page.
ALTER TABLE ec_job_profiles ALTER COLUMN company_id DROP NOT NULL;
