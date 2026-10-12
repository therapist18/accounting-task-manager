-- Syncs requested from the task manager's Immigration Notifications page.
--
-- Deleting a record there with "re-capture" adds the record's identity to the pending request
-- (targets); the EFNS automation (SyncRequestManager in EFNS-AUTOMATIONS/main.mjs) polls this table
-- every minute, runs a sync limited to exactly those records with WhatsApp off, and writes back which
-- came back (result). Written and read with the service role only.
--
-- Idempotent.

CREATE TABLE IF NOT EXISTS efns_sync_requests (
  id           BIGSERIAL PRIMARY KEY,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  requested_by UUID,
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'done', 'error')),
  -- [{ kind: 'notification', permit_type, case_type, name, date }
  --  | { kind: 'payment', payment_type, application_name, applicant_name, application_category, fee_type, date_issued }]
  targets      JSONB NOT NULL DEFAULT '[]'::jsonb,
  started_at   TIMESTAMPTZ,
  finished_at  TIMESTAMPTZ,
  -- { recaptured, missing, items: [{ kind, label, new_id }] }
  result       JSONB,
  error        TEXT
);

CREATE INDEX IF NOT EXISTS efns_sync_requests_status_idx ON efns_sync_requests (status, created_at);

ALTER TABLE efns_sync_requests ENABLE ROW LEVEL SECURITY;
