-- How much mail is actually stored for each connected mailbox, and how far back it goes — shown on
-- the Mailboxes tab so staff can tell at a glance whether a backfill reached as far as it should have,
-- without hunting through the Cases/Needs Review tabs to infer it (see the Kifaru Limited case: 9k
-- messages in Gmail, but the earliest STORED email was 10/06/2025 — this makes that visible directly).
--
-- A view, not a stored/synced column on email_accounts: always exactly correct (no risk of drifting
-- from the real counts the way an incrementally-updated counter could), computed on read rather than
-- adding bookkeeping to the ingest path. emails_account_received_idx makes the aggregation cheap.
--
-- first_email_at is the earliest EMAIL THIS APP STORED for the mailbox, not the mailbox's true oldest
-- message in Gmail — most mail (certificates, acknowledgements, system noise) is deliberately never
-- stored at all, so this reflects what backfill has pulled in, not the mailbox's full history.
--
-- Idempotent (CREATE OR REPLACE / IF NOT EXISTS throughout).

CREATE INDEX IF NOT EXISTS emails_account_received_idx ON emails (account_id, received_at);

CREATE OR REPLACE VIEW email_account_stats AS
SELECT
  account_id,
  COUNT(*)::int AS email_count,
  MIN(received_at) AS first_email_at
FROM emails
WHERE account_id IS NOT NULL
GROUP BY account_id;
