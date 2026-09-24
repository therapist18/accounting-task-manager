-- KRA email classification rules, editable from the Email Center's "Rules" tab.
--
-- Until now the subject -> category patterns lived in lib/email-center/rules.ts (SUBJECT_RULES), so a
-- new kind of KRA notice needed a code change and a deploy. They now live here. The categories they
-- point at are still constants in code (lib/email-center/categories.ts) because a category carries
-- behaviour (does it open a case? attach to one?) — a rule only chooses WHICH category an email is.
--
--   match_type   'contains'  plain text, case-insensitive (what most people want)
--                'regex'     a JavaScript regular expression, case-insensitive
--   sort_order   rules are tried lowest first; the FIRST match wins, so keep specific rules above
--                general ones (same convention the old hard-coded list used)
--   confidence   0..1. At or above 0.8 the email is acted on automatically; below it goes to Needs Review.
--
-- The rows seeded below are exactly the previous hard-coded list, in the same order. If this table is
-- missing (migration not applied yet) or unreachable, ingestion falls back to that same built-in list,
-- so applying this migration is safe at any time.
--
-- RLS is enabled with NO policies: reachable only through the /api/email-center routes (service role).
--
-- All statements are idempotent.

CREATE TABLE IF NOT EXISTS email_classification_rules (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_type     TEXT NOT NULL DEFAULT 'contains' CHECK (match_type IN ('contains', 'regex')),
  pattern        TEXT NOT NULL CHECK (length(btrim(pattern)) > 0 AND length(pattern) <= 300),
  category_key   TEXT NOT NULL,
  confidence     NUMERIC(3, 2) NOT NULL DEFAULT 0.90 CHECK (confidence >= 0 AND confidence <= 1),
  sort_order     INTEGER NOT NULL DEFAULT 1000,
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  notes          TEXT,
  created_by_id  TEXT,
  updated_by_id  TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (match_type, pattern)
);
CREATE INDEX IF NOT EXISTS email_classification_rules_order_idx
  ON email_classification_rules (is_active, sort_order);
ALTER TABLE email_classification_rules ENABLE ROW LEVEL SECURITY;

-- Seed: the previous SUBJECT_RULES, in order (spaced by 10 so new rules can slot between them).
INSERT INTO email_classification_rules (match_type, pattern, category_key, confidence, sort_order, notes) VALUES
  ('regex', $re$notice of intention to verify$re$, 'verification_notice', 0.97, 10, 'Seeded from the original built-in rules'),
  ('regex', $re$pre-?\s?assess?ment$re$,           'pre_assessment',      0.97, 20, 'Seeded from the original built-in rules'),
  ('regex', $re$failure to (file|lodge)|non-?\s?fil(er|ing)|nil return.*(not|failure)$re$, 'failure_to_file', 0.95, 30, 'Seeded from the original built-in rules'),
  ('regex', $re$(agency|demand|penalty|assessment) notice|notice of (assessment|demand)|outstanding (tax|liab)|tax arrears|default assessment$re$, 'demand_penalty', 0.93, 40, 'Seeded from the original built-in rules'),
  ('regex', $re$(tax )?(audit|investigation)|notice of (audit|investigation)$re$, 'audit_notice', 0.90, 50, 'Seeded from the original built-in rules'),
  ('regex', $re$appoint(ed|ment)? as .*(withholding|agent)|withholding (vat )?agent$re$, 'appointment_notice', 0.90, 60, 'Seeded from the original built-in rules'),
  ('regex', $re$request for (documents?|information|records|clarification)|submission of (documents|records)|provide (documents|records)$re$, 'document_request', 0.85, 70, 'Seeded from the original built-in rules'),
  ('regex', $re$withholding (tax )?certificate|tax compliance certificate|\btcc\b$re$, 'certificate', 0.93, 80, 'Seeded from the original built-in rules'),
  ('regex', $re$acknowledg(e)?ment|successfully (received|filed|submitted)|return (received|filed)|payment (receipt|confirmation)$re$, 'return_ack', 0.90, 90, 'Seeded from the original built-in rules'),
  ('regex', $re$statement|ledger$re$, 'statement', 0.80, 100, 'Seeded from the original built-in rules')
ON CONFLICT (match_type, pattern) DO NOTHING;
