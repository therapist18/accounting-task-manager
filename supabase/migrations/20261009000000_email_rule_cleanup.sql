-- Three fixes to rules that had drifted from their intended behaviour, plus a new
-- objection_acknowledgement rule (see lib/email-center/categories.ts):
--
-- 1. The "not transmitting" rule (id 25784665...) picked up "kra web portal account locked",
--    "account has been locked" and a tax-amnesty wording as extra_patterns along the way — all under
--    is_ignore + hard_ignore ("Delete completely"). That silently destroyed genuinely urgent
--    account-locked notices before anyone saw them, which is the opposite of what they need. Stripped
--    back to just its own wording.
--
-- 2. "kra web portal account locked" is restored as its own Notify · Urgent rule instead — stored,
--    flagged, no case opened, exactly what an account-locked notice needs.
--
-- 3. Tax amnesty mail is sender-driven (kenyarevenueauthority@kra.go.ke), and that sender is already
--    in the marketing/bulk-mail ignore rule's extra_sender_patterns (id 4d261205...) — no wording match
--    needed, so no separate amnesty rule is added here.
--
-- 4. return_ack's primary pattern was the bare regex `acknowledg(e)?ment`, matching ANY subject
--    containing the word — which is what let "Acknowledgement of Objection Application" (and
--    potentially other matter-specific acknowledgements) get swept into a generic no-task bucket
--    ahead of a more specific rule. Removed outright (not just reprioritized): the specific wordings
--    already on this rule (successfully filed, payment receipt, customs entry confirmations) still
--    cover the common cases; anything else now surfaces in Needs Review instead of being silently
--    misclassified.
--
-- 5. New: an objection acknowledgement (KRA's receipt confirming an objection was filed, carrying its
--    reference number) attaches to the objection's case instead of falling into return_ack or being
--    mistaken for the objection filing itself. Sort order 105 — below "objection" (110), since its
--    wording also contains "objection application" and would otherwise be caught by that rule first.

UPDATE email_classification_rules
SET extra_patterns = '{}', updated_at = now()
WHERE id = '25784665-a4a3-4b23-afb2-f685eff1d67a';

UPDATE email_classification_rules
SET pattern = 'successfully (received|filed|submitted)',
    extra_patterns = ARRAY[
      'return (received|filed)', 'payment (receipt|confirmation)',
      'payment against payment registration', 'successful completion of payment registration',
      'accepted customs entry', 'released customs entry'
    ],
    notes = 'Routine PRN payment and customs clearance confirmations, none of which need a task — no longer matches on the bare word "acknowledgement" alone (see 20261009000000)',
    updated_at = now()
WHERE id = '41d3bf68-a615-48ed-835e-7cbc864de844';

INSERT INTO email_classification_rules
  (match_type, pattern, extra_patterns, category_key, confidence, sort_order, is_ignore, is_notify, sender_pattern, sender_match_type, notify_priority, notes)
VALUES
  ('contains', 'kra web portal account locked', ARRAY['account has been locked'],
    'notification', 0.90, 145, FALSE, TRUE, 'kra.go.ke', 'contains', 'urgent',
    'Account access blocked — needs attention now, flagged, no case opened'),

  ('contains', 'acknowledgement of objection application',
    ARRAY['objection application acknowledgement', 'acknowledge receipt of your objection'],
    'objection_acknowledgement', 0.90, 105, FALSE, FALSE, NULL, NULL,
    'urgent', 'Receipt confirming the objection was filed — attaches to the objection''s case')

ON CONFLICT (match_type, pattern, (coalesce(sender_pattern, ''))) DO UPDATE SET
  extra_patterns    = EXCLUDED.extra_patterns,
  category_key      = EXCLUDED.category_key,
  confidence        = EXCLUDED.confidence,
  sort_order        = EXCLUDED.sort_order,
  is_ignore         = EXCLUDED.is_ignore,
  is_notify         = EXCLUDED.is_notify,
  sender_pattern    = EXCLUDED.sender_pattern,
  sender_match_type = EXCLUDED.sender_match_type,
  notify_priority   = EXCLUDED.notify_priority,
  notes             = EXCLUDED.notes,
  updated_at        = now();
