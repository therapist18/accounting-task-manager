-- KRA email classification rules, editable from the Email Center's "Rules" tab.
--
-- Until now the subject -> category patterns lived in lib/email-center/rules.ts (SUBJECT_RULES), so a
-- new kind of KRA notice needed a code change and a deploy. They now live here. The categories they
-- point at are still constants in code (lib/email-center/categories.ts) because a category carries
-- behaviour (does it open a case? attach to one?) — a rule only chooses WHICH category an email is.
--
--   match_type       'contains'  plain text, case-insensitive (what most people want)
--                     'regex'     a JavaScript regular expression, case-insensitive
--   pattern           the rule's primary subject wording (must be unique per match_type)
--   extra_patterns    any number of alternative subject wordings — the rule matches when the subject
--                      matches pattern OR any of these. Kept as SEPARATE ARRAY ELEMENTS rather than
--                      one pattern with several alternatives joined by regex "|", on purpose: a rule
--                      like demand_penalty legitimately covers a dozen different real KRA subject
--                      lines, and one 300-character regex blob is unreadable on the Rules tab — each
--                      wording as its own short array entry is what renders as its own line there.
--   sender_pattern /
--   sender_match_type an optional sender-address filter (ignore/notify rules mainly) — see the
--                      20260926000000 migration.
--   is_ignore          matching mail is stored under the Ignored tab and never opens a case.
--   is_notify           matching mail is stored, flagged urgent in Needs Review; no case opened either.
--   sort_order          rules are tried lowest first; the FIRST match wins, so keep specific rules
--                        above general ones.
--   confidence           0..1. At or above 0.8 the email is acted on automatically; below it goes to
--                        Needs Review.
--
-- If this table is missing (migration not applied yet) or unreachable, ingestion falls back to the
-- built-in list in rules.ts, so applying this migration is safe at any time. All statements below are
-- idempotent and safe to re-run (including the seed, which upserts by (match_type, pattern) and never
-- touches a rule's is_active — so re-running this file never silently re-enables one you turned off).
--
-- RLS is enabled with NO policies: reachable only through the /api/email-center routes (service role).

CREATE TABLE IF NOT EXISTS email_classification_rules (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_type         TEXT NOT NULL DEFAULT 'contains' CHECK (match_type IN ('contains', 'regex')),
  pattern            TEXT NOT NULL CHECK (length(btrim(pattern)) > 0 AND length(pattern) <= 300),
  -- Alternative subject wordings (see note above) — added by the 20260927000000 migration for a
  -- table created before that; included directly here so a brand-new database needs no follow-up.
  extra_patterns     TEXT[] NOT NULL DEFAULT '{}',
  category_key       TEXT NOT NULL,
  confidence         NUMERIC(3, 2) NOT NULL DEFAULT 0.90 CHECK (confidence >= 0 AND confidence <= 1),
  sort_order         INTEGER NOT NULL DEFAULT 1000,
  is_active          BOOLEAN NOT NULL DEFAULT TRUE,
  notes              TEXT,
  -- Added by 20260925000000 / 20260926000000 for a table created before those; see there for details.
  is_ignore          BOOLEAN NOT NULL DEFAULT FALSE,
  is_notify          BOOLEAN NOT NULL DEFAULT FALSE,
  sender_pattern     TEXT,
  sender_match_type  TEXT CHECK (sender_match_type IN ('contains', 'regex')),
  created_by_id      TEXT,
  updated_by_id      TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (match_type, pattern)
);
CREATE INDEX IF NOT EXISTS email_classification_rules_order_idx
  ON email_classification_rules (is_active, sort_order);
ALTER TABLE email_classification_rules ENABLE ROW LEVEL SECURITY;

-- Seed / reseed. Spaced by 10 so new rules can slot in between. is_active is deliberately left out of
-- the UPDATE so re-running this file never re-enables a rule someone switched off from the Rules tab.
INSERT INTO email_classification_rules
  (match_type, pattern, extra_patterns, category_key, confidence, sort_order, is_ignore, is_notify, sender_pattern, sender_match_type, notes)
VALUES
  ('contains', 'notice of intention to verify', ARRAY['verification notice'],
    'verification_notice', 0.97, 10, FALSE, FALSE, NULL, NULL, 'Seeded'),

  ('contains', 'pre-assessment', ARRAY['pre assessment', 'preassessment'],
    'pre_assessment', 0.97, 20, FALSE, FALSE, NULL, NULL, 'Seeded'),

  ('regex', 'failure to (file|lodge)',
    ARRAY['non-?\s?fil(er|ing)', 'nil return.*(not|failure)', 'reminder to file'],
    'failure_to_file', 0.95, 30, FALSE, FALSE, NULL, NULL, 'Seeded'),

  ('regex', '(agency|demand|penalty|assessment) notice',
    ARRAY[
      'notice of (assessment|demand)', 'outstanding (tax|liab)', 'tax arrears', 'vat arrears',
      'default assessment', 'outstanding vat liability', 'outstanding withholding vat', 'tax demand',
      'non remittance', 'settlement notice', 'payment defaulter', 'tax amnesty',
      'additional assessment', 'auto assessment', 'assessment amendment', 'assessment and amendment'
    ],
    'demand_penalty', 0.93, 40, FALSE, FALSE, NULL, NULL, 'Seeded'),

  ('regex', 'audit',
    ARRAY[
      'investigation', 'notice of (audit|investigation)', 'compliance review', 'compliance check',
      'findings', 'interview', 'inspection', 'appear before the commissioner', 'tour of premises',
      'disallow'
    ],
    'audit_notice', 0.90, 50, FALSE, FALSE, NULL, NULL, 'Seeded'),

  ('regex', 'appoint(ed|ment)? as .*(withholding|agent)',
    ARRAY[
      'withholding (vat )?agent', 'witholding (vat )?agent', 'withholding rent agent',
      'registration for pay point'
    ],
    'appointment_notice', 0.90, 60, FALSE, FALSE, NULL, NULL, 'Seeded'),

  ('regex', 'request for (documents?|information|records|clarification)',
    ARRAY[
      'submission of (documents|records)', 'provide (documents|records)', 'supplier confirmation',
      'return amendment', 'amended return', 'request for feedback'
    ],
    'document_request', 0.85, 70, FALSE, FALSE, NULL, NULL, 'Seeded'),

  ('regex', 'withholding (tax )?certificate', ARRAY['tax compliance certificate', '\btcc\b'],
    'certificate', 0.93, 80, FALSE, FALSE, NULL, NULL, 'Seeded'),

  ('regex', 'acknowledg(e)?ment',
    ARRAY['successfully (received|filed|submitted)', 'return (received|filed)', 'payment (receipt|confirmation)'],
    'return_ack', 0.90, 90, FALSE, FALSE, NULL, NULL, 'Seeded'),

  ('contains', 'statement', ARRAY['ledger'],
    'statement', 0.80, 100, FALSE, FALSE, NULL, NULL, 'Seeded'),

  -- New: objections and refunds are their own KRA matters (see categories.ts) rather than being
  -- squeezed into demand_penalty/document_request.
  ('contains', 'objection application', ARRAY['notice of objection', 'objection against', 'vaa objection'],
    'objection', 0.90, 110, FALSE, FALSE, NULL, NULL, 'Objection raised — opens/attaches to its own case'),

  ('contains', 'objection decision',
    ARRAY['approval or rejection of objection', 'late objection rejection', 'review of late objection', 'objection review', 'rejection of objection'],
    'objection_decision', 0.85, 120, FALSE, FALSE, NULL, NULL, 'Outcome of an objection — same approve/reject handling as Extension of Time Response'),

  ('contains', 'refund application', ARRAY['refund claim', 'vat refund', 'wh vat refund', 'refund'],
    'refund', 0.85, 130, FALSE, FALSE, NULL, NULL, 'Seeded'),

  -- New: important-but-not-a-case KRA operational notices. Sender-restricted to kra.go.ke because
  -- notify rules (unlike classify rules) are checked against every sender, and these wordings alone
  -- are too generic to safely match mail from anyone.
  ('contains', 'deactivation of pin',
    ARRAY['not transmitting', 'special table removal and reactivation', 'pin reactivation'],
    'notification', 0.90, 140, FALSE, TRUE, 'kra.go.ke', 'contains', 'Urgent account/PIN issue — flagged, no case opened'),

  ('contains', 'invitation for a meeting',
    ARRAY['invitation to a meeting', 'meeting for tariff clarification'],
    'notification', 0.85, 150, FALSE, TRUE, 'kra.go.ke', 'contains', 'Needs a response but isn''t a KRA notice — flagged, no case opened')

ON CONFLICT (match_type, pattern) DO UPDATE SET
  extra_patterns    = EXCLUDED.extra_patterns,
  category_key      = EXCLUDED.category_key,
  confidence        = EXCLUDED.confidence,
  sort_order        = EXCLUDED.sort_order,
  is_ignore         = EXCLUDED.is_ignore,
  is_notify         = EXCLUDED.is_notify,
  sender_pattern    = EXCLUDED.sender_pattern,
  sender_match_type = EXCLUDED.sender_match_type,
  notes             = EXCLUDED.notes,
  updated_at        = now();
