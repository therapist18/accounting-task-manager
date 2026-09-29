-- Sets notify_priority on the existing seeded notify rules, and seeds two more that weren't covered
-- yet, so the Rules tab's Urgent/FYI split (20261005000000_email_rule_notify_priority.sql) actually
-- reflects real examples instead of everything defaulting to 'urgent':
--
--   Registered Customs Entry        urgent          real duty now due — worth confirming it gets paid
--   Deactivation of PIN             urgent          (unchanged — already the default)
--   Invitation for a meeting        urgent          (unchanged — already the default)
--   Do you qualify for the Amnesty  informational   general awareness mail, not about this client
--   KRA Web Portal account Locked   urgent          new — account access blocked, needs attention now
--   Password Reset confirmation     informational   new — just confirms a reset already happened
--
-- Idempotent: the UPDATE only touches notify_priority on rows matched by pattern, and the INSERT
-- upserts by the same (match_type, pattern, sender_pattern) target the seed migration uses, so
-- re-running this file never creates duplicates or disturbs is_active.

update email_classification_rules
set notify_priority = 'informational', updated_at = now()
where match_type = 'contains' and pattern = 'do you qualify for the tax amnesty';

insert into email_classification_rules
  (match_type, pattern, extra_patterns, category_key, confidence, sort_order, is_ignore, is_notify, sender_pattern, sender_match_type, notify_priority, notes)
values
  ('contains', 'kra web portal account locked',
    array['web portal account has been locked', 'account has been locked'],
    'notification', 0.90, 175, false, true, 'kra.go.ke', 'contains', 'urgent',
    'Account access blocked — needs attention now, flagged, no case opened'),

  ('contains', 'password reset for kra web portal',
    array['your password has been reset', 'password reset confirmation'],
    'notification', 0.85, 180, false, true, 'kra.go.ke', 'contains', 'informational',
    'Just confirms a reset already happened — FYI, flagged, no case opened')

on conflict (match_type, pattern, (coalesce(sender_pattern, ''))) do update set
  extra_patterns    = excluded.extra_patterns,
  category_key      = excluded.category_key,
  confidence        = excluded.confidence,
  sort_order        = excluded.sort_order,
  is_ignore         = excluded.is_ignore,
  is_notify         = excluded.is_notify,
  sender_pattern    = excluded.sender_pattern,
  sender_match_type = excluded.sender_match_type,
  notify_priority   = excluded.notify_priority,
  notes             = excluded.notes,
  updated_at        = now();
