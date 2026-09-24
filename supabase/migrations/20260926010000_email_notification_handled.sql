-- Notifications are worked through like a task, but are deliberately never written to email_case or
-- tm_tasks. The "handled by" audit trail lives on the email row itself: who took the notification on
-- and when — the same session-user-id convention as email_case.completed_by_id/completed_at
-- (20260907000000_task_audit_trail.sql). handled_at IS NULL while still in the active notifications
-- basket; handled rows leave the active basket but stay visible (with the trail) under the basket's
-- "Handled" view so the work is auditable.

ALTER TABLE emails
  ADD COLUMN IF NOT EXISTS handled_by_id TEXT,
  ADD COLUMN IF NOT EXISTS handled_at     TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS emails_handled_idx ON emails (handled_at);