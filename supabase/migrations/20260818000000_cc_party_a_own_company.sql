-- Consultancy Contracts currently has no way to identify which
-- acc_portal_company_duplicate row is Booksmart Consultancy Limited itself
-- (Party A) as opposed to the client selected from the dropdown (Party B) -
-- BCL's name/address/KRA PIN are hardcoded as literal prose in the template
-- (see 20260813000001_seed_cc_template_and_placeholders.sql) rather than
-- resolved from real company data. This migration:
--   1. Flags exactly one companies row as "our own company" via a partial
--      unique index (at most one row can ever be true).
--   2. Adds party_a_* placeholders that reuse the SAME master fields as the
--      existing company_name/company_kra_pin/company_address (Party B)
--      placeholders - only the companyId passed to resolveEcPlaceholderValues
--      at render time differs, so one set of master fields serves both
--      sides. Party B's own keys are untouched (still shared with Employment
--      Contracts, where they mean the employer - see the note in
--      20260813000000_consultancy_contract_engine.sql).

ALTER TABLE acc_portal_company_duplicate
  ADD COLUMN IF NOT EXISTS is_own_company boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS acc_portal_company_duplicate_is_own_company_idx
  ON acc_portal_company_duplicate (is_own_company)
  WHERE is_own_company;

UPDATE acc_portal_company_duplicate
  SET is_own_company = true
  WHERE company_name = 'BOOKSMART CONSULTANCY LIMITED'
    AND NOT EXISTS (SELECT 1 FROM acc_portal_company_duplicate WHERE is_own_company);

INSERT INTO ec_placeholders (key, label, group_label, source_kind, master_field_id, entity_type, master_field_links, description, required, editable) VALUES
  ('party_a_name', 'Party A - Company Name', 'Consultancy Contract', 'master_field', 61, ARRAY['company'],
    '[{"master_field_id":"61","display_priority":1,"strategy":"fallback"}]'::jsonb,
    'Booksmart Consultancy Limited''s own name, resolved from the is_own_company-flagged row.', false, true),
  ('party_a_kra_pin', 'Party A - KRA PIN', 'Consultancy Contract', 'master_field', 56, ARRAY['company'],
    '[{"master_field_id":"56","display_priority":1,"strategy":"fallback"}]'::jsonb,
    'Booksmart Consultancy Limited''s own KRA PIN, resolved from the is_own_company-flagged row.', false, true),
  ('party_a_address', 'Party A - Address', 'Consultancy Contract', 'master_field', 57, ARRAY['company'],
    '[{"master_field_id":"57","display_priority":1,"strategy":"merge"},{"master_field_id":"14","display_priority":2,"strategy":"merge"},{"master_field_id":"76","display_priority":3,"strategy":"merge"}]'::jsonb,
    'Booksmart Consultancy Limited''s own address, resolved from the is_own_company-flagged row.', false, true)
ON CONFLICT (key) DO NOTHING;
