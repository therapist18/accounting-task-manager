-- Two new classify rules for the VAT Special Table matter (see lib/email-center/categories.ts:
-- vat_special_table / vat_special_table_removed):
--
--   vat_special_table          "Notice of Intention of Addition..." — action_required, opens a case
--                               (real casework: a letter + supporting documents requesting the uplift).
--   vat_special_table_removed  "You have been removed..." — update_only, attaches to whatever case the
--                               notice above opened rather than opening its own; someone still marks
--                               the case Completed once they've seen the confirmation.
--
-- Idempotent, same upsert-by-(match_type, pattern, sender_pattern) convention as the other seeded
-- rules; re-running this file never re-enables a rule someone has switched off.

INSERT INTO email_classification_rules
  (match_type, pattern, extra_patterns, category_key, confidence, sort_order, is_ignore, is_notify, sender_pattern, sender_match_type, notes)
VALUES
  ('contains', 'notice of intention of addition to the vat special table',
    ARRAY['addition to the vat special table', 'added to the vat special table'],
    'vat_special_table', 0.90, 65, FALSE, FALSE, 'kra.go.ke', 'contains',
    'Restricted from claiming input VAT until resolved — opens a case for the uplift request'),

  ('contains', 'removed from the vat special table', ARRAY[]::text[],
    'vat_special_table_removed', 0.90, 125, FALSE, FALSE, 'kra.go.ke', 'contains',
    'Confirms the uplift — attaches to the existing case, doesn''t open a new one')

ON CONFLICT (match_type, pattern, (coalesce(sender_pattern, ''))) DO UPDATE SET
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
