-- EFNS auto-filing: the EFNS automation's notifications and payment invoices are filed into the
-- matching task's stage documents (lib/efnsFiling.server.ts), instead of someone downloading each
-- PDF and uploading it to the task by hand.
--
-- Written by the EFNS automation, from the portal's printable page:
--   file_number          the immigration file number when the page shows one; matched to tm_tasks.r_number
--   printable_applicant  applicant name on the page (the list's own "name" is often an id)
--   printable_company    company name on the page
--
-- Written by the filing job:
--   filing_status  NULL       not looked at yet
--                  'filed'    saved to a task's stage document (see filing)
--                  'no_rule'  no stage document is set to take this permit type + status
--                  'no_match' no open task matched; 'ambiguous' more than one did — both wait in
--                             the Immigration Notifications page's "Needs a task" list
--                  'error'    filing failed (filing.error); retried on the next run
--   filing         { task_id, stage_id, stage_name, kyc_document_id, document_id, individual_id,
--                    matched_by: 'file_number' | 'name' | 'manual', by_id?, candidates?, error? }
--   filed_at       when it was filed
--
-- Idempotent.

ALTER TABLE immigration_notifications
  ADD COLUMN IF NOT EXISTS file_number         TEXT,
  ADD COLUMN IF NOT EXISTS printable_applicant TEXT,
  ADD COLUMN IF NOT EXISTS printable_company   TEXT,
  ADD COLUMN IF NOT EXISTS filing_status       TEXT,
  ADD COLUMN IF NOT EXISTS filing              JSONB,
  ADD COLUMN IF NOT EXISTS filed_at            TIMESTAMPTZ;

ALTER TABLE immigration_payments
  ADD COLUMN IF NOT EXISTS file_number         TEXT,
  ADD COLUMN IF NOT EXISTS printable_applicant TEXT,
  ADD COLUMN IF NOT EXISTS printable_company   TEXT,
  ADD COLUMN IF NOT EXISTS filing_status       TEXT,
  ADD COLUMN IF NOT EXISTS filing              JSONB,
  ADD COLUMN IF NOT EXISTS filed_at            TIMESTAMPTZ;

-- The job picks up what it hasn't finished with.
CREATE INDEX IF NOT EXISTS immigration_notifications_filing_status_idx ON immigration_notifications (filing_status);
CREATE INDEX IF NOT EXISTS immigration_payments_filing_status_idx      ON immigration_payments (filing_status);
