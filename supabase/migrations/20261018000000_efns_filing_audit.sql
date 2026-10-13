-- EFNS filing audit trail + cached PDF labels.
--
-- efns_filing_events: one row per thing auto-filing or a staff member did with an EFNS item on a
-- task's stage — filed onto an empty stage, replaced the stage's document, added alongside it, or
-- (auto-filing) skipped because the stage was already filled. linked_by tells auto-linked ('auto')
-- from staff-linked ('staff'); actor_id is the staff member (scanner_users.id) where there is one.
-- The same who/how is also stamped on the stage entry's document (tm_tasks.stages → documents →
-- linked_by / linked_by_id / link_mode), on the document row (acc_portal_directors_documents.metadata)
-- and on the item (filing.linked_by / mode). Written by the task manager with the service role.
--
-- pdf_labels: the "Label: value" pairs read off each item's PDF (lib/efnsDocumentFields.server.ts),
-- cached by the auto-filing job so the Immigration Notifications page can show every record's
-- document-type fields on load without re-reading PDFs.
--
-- Idempotent.

CREATE TABLE IF NOT EXISTS efns_filing_events (
  id                     BIGSERIAL PRIMARY KEY,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  item_kind              TEXT NOT NULL CHECK (item_kind IN ('notification', 'payment')),
  item_id                BIGINT NOT NULL,
  task_id                BIGINT,
  stage_id               TEXT,
  stage_name             TEXT,
  kyc_document_id        TEXT,
  document_id            TEXT,
  action                 TEXT NOT NULL CHECK (action IN ('filed', 'replaced', 'added_alongside', 'skipped_already_filled', 'unfiled')),
  linked_by              TEXT NOT NULL CHECK (linked_by IN ('auto', 'staff')),
  actor_id               TEXT,
  matched_by             TEXT,
  replaced_document_ids  TEXT[] NOT NULL DEFAULT '{}',
  stage_was_completed    BOOLEAN
);

CREATE INDEX IF NOT EXISTS efns_filing_events_item_idx ON efns_filing_events (item_kind, item_id);
CREATE INDEX IF NOT EXISTS efns_filing_events_task_idx ON efns_filing_events (task_id, created_at DESC);

ALTER TABLE efns_filing_events ENABLE ROW LEVEL SECURITY;

ALTER TABLE immigration_notifications ADD COLUMN IF NOT EXISTS pdf_labels JSONB;
ALTER TABLE immigration_payments      ADD COLUMN IF NOT EXISTS pdf_labels JSONB;
