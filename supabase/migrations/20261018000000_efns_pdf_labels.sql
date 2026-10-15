-- The "Label: value" pairs read off each EFNS item's PDF (lib/efnsDocumentFields.server.ts), cached
-- by the auto-filing job so the Immigration Notifications page can show every record's document-type
-- fields on load without re-reading PDFs. {} = looked at, nothing readable.
--
-- (The filing audit trail — auto vs staff, new / replace / add / unfiled — lives in tm_tasks.stages:
-- each linked document's linked_by / linked_by_id / link_mode and the stage's link_history.)
--
-- Idempotent.

ALTER TABLE immigration_notifications ADD COLUMN IF NOT EXISTS pdf_labels JSONB;
ALTER TABLE immigration_payments      ADD COLUMN IF NOT EXISTS pdf_labels JSONB;
