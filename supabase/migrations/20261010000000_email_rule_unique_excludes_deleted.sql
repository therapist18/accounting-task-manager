-- Fixes a real bug: deleting a rule is a SOFT delete (is_active=false, deleted_at set — the row stays
-- in the table so a task's created_by_rule_id keeps resolving and the delete has an audit trail, see
-- app/api/email-center/rules/[id]/route.ts's DELETE handler), but the uniqueness index added in
-- 20260930000000 applies to every row regardless of deleted_at. A deleted rule's (match_type, pattern,
-- sender_pattern) combination is therefore permanently unusable afterwards — re-creating a rule with
-- the same wording, or editing a different rule to end up with the same tuple (e.g. just flipping its
-- match_type to one a since-deleted rule already used), fails with "A rule with this exact pattern
-- already exists." even though nothing currently active actually conflicts.
--
-- Fix: make it a PARTIAL unique index that only looks at active (not-deleted) rows. A deleted rule's
-- old pattern is free to be reused the moment it's gone; two live rules still can't collide.
--
-- Note for future seed migrations: a partial unique index can only be the target of an
-- `ON CONFLICT (...)` upsert when that clause's own WHERE predicate matches the index's — any new
-- seed migration upserting by (match_type, pattern, sender_pattern) needs
-- `ON CONFLICT (match_type, pattern, (coalesce(sender_pattern, ''))) WHERE deleted_at IS NULL` from
-- here on, not the plain form the earlier seed migrations used (those already ran; only new ones need
-- the predicate added).

drop index if exists email_classification_rules_match_pattern_sender_uidx;

create unique index if not exists email_classification_rules_match_pattern_sender_uidx
  on email_classification_rules (match_type, pattern, coalesce(sender_pattern, ''))
  where deleted_at is null;
