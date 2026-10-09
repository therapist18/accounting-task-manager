-- Mailbox audit trail + one row per Gmail address.
--
-- created_by_id  scanner_users.id of whoever connected the mailbox (NULL for rows that predate this,
--                or a connect made without an app session). Same convention as the other *_by_id
--                columns (20260907000000_task_audit_trail.sql): an id, names looked up at read time.
-- audit_log      append-only jsonb array, one entry per connect / reconnect / link / unlink:
--                { action, by_id, at, company_id?, from_company_id? }. Lives on the row itself, like
--                job_applicant_cvs.audit_log, rather than in a separate table.
--
-- The unique index stops the OAuth callback ever inserting a second row for an address that is
-- already connected (which is how info@booksmartconsult.com ended up both linked and unlinked). It
-- is only created once no duplicates remain — remove them first (keep the row holding the mail),
-- then re-run this file. Idempotent.

ALTER TABLE email_accounts
  ADD COLUMN IF NOT EXISTS created_by_id TEXT,
  ADD COLUMN IF NOT EXISTS audit_log     JSONB NOT NULL DEFAULT '[]'::jsonb;

UPDATE email_accounts SET email = lower(trim(email)) WHERE email <> lower(trim(email));

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM email_accounts GROUP BY lower(trim(email)) HAVING count(*) > 1
  ) THEN
    RAISE NOTICE 'email_accounts has duplicate addresses — unique index NOT created. Remove the duplicates and re-run.';
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS email_accounts_email_unique ON email_accounts (lower(trim(email)));
  END IF;
END $$;
