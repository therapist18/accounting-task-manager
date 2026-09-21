-- KRA Correspondence Center: multi-mailbox email ingestion, classification and email cases.
--
-- Model (one new table)
--   email_accounts   one row per connected Gmail mailbox; company_id says which company the mailbox
--                    belongs to, so an email's company is known deterministically (no AI guessing).
--   emails           existing table, now a light ledger: only emails that belong to a KRA matter or are
--                    waiting in Needs Review are stored (noise / acknowledgements / certificates stay in
--                    Gmail). Bodies are not stored — they are fetched from Gmail when opened.
--   email_case       NEW. One row per KRA matter == one row of the "KRA CORESPONDENCE PLATFORM" Sheet1.
--                    It IS the task: these are deliberately NOT written to tm_tasks. job_level carries
--                    department 2 (KRA) / subdepartment 28 ("KRA ITAX EMAILS") so a case can be promoted
--                    to a tm_tasks row later without guessing. Task audit lives on the row itself:
--                    created_by_id, assigned_to_id/by/at, completed_by_id/at (session user ids, never
--                    display names — same convention as 20260907000000_task_audit_trail.sql).
--
-- KRA email categories are constants in code (lib/email-center/categories.ts); email_categories is
-- not touched.
--
-- Type notes: ids of tables this migration does not own (emails.id, acc_portal_company_duplicate.id)
-- are not visible in the migrations folder, so links to them are plain TEXT without foreign keys.
-- Emails are linked by gmail_message_id (TEXT), never emails.id.
--
-- email_case has RLS enabled and NO policies: it is only reachable through the server (service role)
-- API routes under /api/email-center, which authenticate the session user first.
--
-- All statements are idempotent.

-- === email_accounts: mailbox -> company, sync health, sync lock ===
ALTER TABLE email_accounts
  ADD COLUMN IF NOT EXISTS company_id             TEXT,
  ADD COLUMN IF NOT EXISTS provider               TEXT NOT NULL DEFAULT 'gmail',
  ADD COLUMN IF NOT EXISTS last_synced_at         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_sync_error        TEXT,
  -- Pub/Sub can fire many pushes at once; only one sync runs per mailbox, the rest set sync_pending
  -- so the running sync makes another pass instead of dropping the notification.
  ADD COLUMN IF NOT EXISTS sync_lock_until        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sync_pending           BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS company_assigned_by_id TEXT,
  ADD COLUMN IF NOT EXISTS updated_by_id          TEXT;

-- Gmail historyIds can exceed 2^31 on busy mailboxes; widen the column if it was created as integer.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'email_accounts'
      AND column_name = 'history_id' AND data_type IN ('integer','smallint')
  ) THEN
    ALTER TABLE email_accounts ALTER COLUMN history_id TYPE BIGINT;
  END IF;
END $$;

-- === emails: company, direction, classification result ===
ALTER TABLE emails
  ADD COLUMN IF NOT EXISTS company_id            TEXT,
  ADD COLUMN IF NOT EXISTS direction             TEXT NOT NULL DEFAULT 'inbound',
  ADD COLUMN IF NOT EXISTS to_addresses          TEXT,
  ADD COLUMN IF NOT EXISTS cc_addresses          TEXT,
  ADD COLUMN IF NOT EXISTS has_attachments       BOOLEAN NOT NULL DEFAULT FALSE,
  -- [{ filename, mime_type, size_bytes, storage_path, extraction_status }]
  ADD COLUMN IF NOT EXISTS attachments           JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS disposition           TEXT,
  ADD COLUMN IF NOT EXISTS category_key          TEXT,
  ADD COLUMN IF NOT EXISTS classification_source TEXT,
  ADD COLUMN IF NOT EXISTS review_reason         TEXT,
  ADD COLUMN IF NOT EXISTS kra_pin               TEXT,
  ADD COLUMN IF NOT EXISTS extracted             JSONB,
  ADD COLUMN IF NOT EXISTS case_id               UUID,
  ADD COLUMN IF NOT EXISTS classified_by_id      TEXT,
  ADD COLUMN IF NOT EXISTS classified_at         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS processed_at          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_by_id         TEXT;

-- The ingest upserts on gmail_message_id, so it must be unique.
CREATE UNIQUE INDEX IF NOT EXISTS emails_gmail_message_id_uidx ON emails (gmail_message_id);
CREATE INDEX IF NOT EXISTS emails_company_received_idx ON emails (company_id, received_at DESC);
CREATE INDEX IF NOT EXISTS emails_disposition_idx      ON emails (disposition);
CREATE INDEX IF NOT EXISTS emails_thread_idx           ON emails (gmail_thread_id);
CREATE INDEX IF NOT EXISTS emails_case_idx             ON emails (case_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'emails_disposition_chk') THEN
    ALTER TABLE emails
      ADD CONSTRAINT emails_disposition_chk
      CHECK (disposition IS NULL OR disposition IN ('action_required','update_only','ignore','needs_review'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'emails_direction_chk') THEN
    ALTER TABLE emails
      ADD CONSTRAINT emails_direction_chk CHECK (direction IN ('inbound','outbound'));
  END IF;
END $$;

-- === email_case: one row per KRA matter (= one row of Sheet1) ===
CREATE SEQUENCE IF NOT EXISTS email_case_ref_seq;

CREATE TABLE IF NOT EXISTS email_case (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_ref                 TEXT UNIQUE NOT NULL
                           DEFAULT ('KRA-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('email_case_ref_seq')::text, 5, '0')),
  company_id               TEXT,
  gmail_thread_id          TEXT UNIQUE,
  opened_gmail_message_id  TEXT,
  category_key             TEXT,
  notice_type              TEXT,
  subject                  TEXT,
  kra_pin                  TEXT,

  -- Department 2 (KRA) / subdepartment 28 (KRA ITAX EMAILS)
  job_level                JSONB NOT NULL
                           DEFAULT '{"level":2,"department_id":2,"subdepartment_id":28}'::jsonb,

  -- FROM KRA EMAIL
  kra_email_from           TEXT,
  kra_email_cc             TEXT,
  email_date               DATE,
  deadline_date            DATE,
  contents                 TEXT,
  attachments_summary      TEXT,
  signing_officer_name     TEXT,
  signing_officer_position TEXT,

  -- WHEN BCL RESPONDS TO KRA
  respond_date             DATE,
  responded_by_id          TEXT,
  respond_contents         TEXT,
  promised_date            DATE,
  approval_status          TEXT NOT NULL DEFAULT 'not_responded'
                           CHECK (approval_status IN ('not_responded','pending','approved','rejected','not_applicable')),
  approval_date            DATE,

  -- Task tracking + audit: who created it (NULL = the system, from an incoming email), who it is
  -- assigned to and by whom, who completed it.
  status                   TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  created_by_id            TEXT,
  assigned_to_id           TEXT,
  assigned_by_id           TEXT,
  assigned_at              TIMESTAMPTZ,
  completed_by_id          TEXT,
  completed_at             TIMESTAMPTZ,
  updated_by_id            TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS email_case_company_idx  ON email_case (company_id);
CREATE INDEX IF NOT EXISTS email_case_status_idx   ON email_case (status, deadline_date);
CREATE INDEX IF NOT EXISTS email_case_pin_idx      ON email_case (kra_pin);
CREATE INDEX IF NOT EXISTS email_case_assignee_idx ON email_case (assigned_to_id);
ALTER TABLE email_case ENABLE ROW LEVEL SECURITY;

-- === Private storage bucket for KRA letters / attachments (served via signed URLs) ===
INSERT INTO storage.buckets (id, name, public)
VALUES ('email-attachments', 'email-attachments', false)
ON CONFLICT (id) DO NOTHING;
