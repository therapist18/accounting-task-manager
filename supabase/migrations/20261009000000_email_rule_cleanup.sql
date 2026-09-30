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
--    ahead of a more specific rule. Removed (not just reprioritized) — BUT replaced with explicit,
--    safe wordings for the actual high-volume acknowledgement types found by querying the real mail
--    history (see conversation), because the bare pattern turned out to be the ONLY thing matching by
--    far the single largest category of KRA mail: routine VAT/PAYE/Company return acknowledgements
--    (thousands of rows). Losing that pattern without replacing it would have dumped all of them into
--    Needs Review. The new wordings are specific enough to never match "Acknowledgement of Objection
--    Application" or "...of Appeal" (neither contains "return", "amendment", "transaction" or
--    "payment transfer"), so the original collision this migration set out to fix is still fixed.
--
-- 5. New: an objection acknowledgement (KRA's receipt confirming an objection was filed, carrying its
--    reference number) attaches to the objection's case instead of falling into return_ack or being
--    mistaken for the objection filing itself. Sort order 105 — below "objection" (110), since its
--    wording also contains "objection application" and would otherwise be caught by that rule first.
--
-- 6. demand_penalty gets two more real-world wordings found the same way: "return defaulter" (seen
--    without the word "payment" in front, so the existing "payment defaulter" wording missed it) and
--    "inconsistency notice" (a recurring monthly VAT notice with no rule at all before this).
--
-- 7. certificate gets "tax amnesty certificate" — a genuine document sent from admin.itax2@kra.go.ke
--    (209+ occurrences), distinct from the unrelated tax-amnesty AWARENESS marketing blasts (those come
--    from kenyarevenueauthority@kra.go.ke, already ignored by sender). Nothing matched this before.

UPDATE email_classification_rules
SET extra_patterns = '{}', updated_at = now()
WHERE id = '25784665-a4a3-4b23-afb2-f685eff1d67a';

UPDATE email_classification_rules
SET pattern = 'successfully (received|filed|submitted)',
    extra_patterns = ARRAY[
      'return (received|filed)', 'payment (receipt|confirmation)',
      'payment against payment registration', 'successful completion of payment registration',
      'accepted customs entry', 'released customs entry',
      'acknowledgement of .*(value added tax|income tax|paye|company) return',
      'acknowledgement of .*amendment',
      'acknowledgement for transactions declared',
      'acknowledgement for payment transfer',
      'reprint pin certificate'
    ],
    notes = 'Routine return/PRN/amendment acknowledgements and customs clearance confirmations, none of which need a task — no longer matches on the bare word "acknowledgement" alone (see 20261009000000)',
    updated_at = now()
WHERE id = '41d3bf68-a615-48ed-835e-7cbc864de844';

UPDATE email_classification_rules
SET extra_patterns = extra_patterns || ARRAY['return defaulter', 'inconsistency notice']
WHERE id = 'a45dfea4-65a2-4ea5-b6a2-4c6b4af69f21'
  AND NOT ('return defaulter' = ANY(extra_patterns));

UPDATE email_classification_rules
SET extra_patterns = extra_patterns || ARRAY['tax amnesty certificate']
WHERE id = 'e79e2959-7b56-464b-89a7-2049c0190e76'
  AND NOT ('tax amnesty certificate' = ANY(extra_patterns));

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
