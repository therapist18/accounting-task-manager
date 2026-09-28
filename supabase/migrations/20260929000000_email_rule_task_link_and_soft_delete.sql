-- Two things, both about accountability for automatic classification:
--
-- 1. email_case.created_by_rule_id — which rule (if any) auto-opened a task, so "this rule shouldn't
--    have created these" has an answer. ON DELETE SET NULL: if the rule row is ever actually removed
--    (it normally won't be — see below), the task just loses the reference rather than failing to
--    delete or cascading.
--
-- 2. email_classification_rules gets a soft delete (deleted_at / deleted_by_id) instead of a hard
--    DELETE. Deleting a rule from the Rules tab now records who did it and when, same as every other
--    write in this module — a hard delete left literally no trace, not even of the delete itself.
--    Deleted rules disappear from the Rules tab and from classification (rule-store.ts and the GET
--    route both filter deleted_at IS NULL) but the row stays, so a task's created_by_rule_id keeps
--    resolving to something even after its rule is "deleted".
--
-- Idempotent.

ALTER TABLE email_case
  ADD COLUMN IF NOT EXISTS created_by_rule_id UUID REFERENCES email_classification_rules(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS email_case_created_by_rule_idx ON email_case (created_by_rule_id);

ALTER TABLE email_classification_rules
  ADD COLUMN IF NOT EXISTS deleted_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by_id TEXT;
CREATE INDEX IF NOT EXISTS email_classification_rules_deleted_idx ON email_classification_rules (deleted_at);
