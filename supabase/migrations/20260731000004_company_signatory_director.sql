-- Adds a designated "signatory director" per company - there was no
-- persisted primary/main-director concept anywhere before this (directors
-- live as JSON entries inside registry_individuals.employment_data.associations,
-- and the only existing "is_primary" concept - TemplateGenerationDialog.tsx's
-- director_type === 'primary' - is set per-task at task-creation time, not a
-- company-level fact). Used by the Employment Contract Engine's
-- {{signatory_name}}/{{signatory_title}} tokens (already referenced in the
-- original seed clause content, but never resolved by anything until now).
ALTER TABLE acc_portal_company_duplicate
  ADD COLUMN signatory_individual_id BIGINT REFERENCES registry_individuals(id) ON DELETE SET NULL;
