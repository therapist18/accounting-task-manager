-- Audit-trail columns for the tasks-tracking module.
--
-- Every user action written to these tables now embeds the authenticated session
-- user's id and the timestamp — no display name is stored (looked up from the id
-- at read time instead). Stage-level audit (completed_by_id, skipped_by, officers_updated_by_id,
-- updated_by_id, created_by_id) lives inside tm_tasks.stages (jsonb) and needs no schema change.
--
-- All ADD COLUMN statements are idempotent.

-- === tm_tasks: task-level who created / last updated ===
ALTER TABLE tm_tasks
  ADD COLUMN IF NOT EXISTS updated_by_id   TEXT;

-- === acc_portal_directors_documents: uploader + reviewer + last editor ===
ALTER TABLE acc_portal_directors_documents
  ADD COLUMN IF NOT EXISTS uploaded_by     jsonb,
  ADD COLUMN IF NOT EXISTS updated_by_id   TEXT,
  ADD COLUMN IF NOT EXISTS reviewed_by_id  TEXT,
  ADD COLUMN IF NOT EXISTS edited_by_id    TEXT;

-- === acc_portal_kyc_uploads: uploader + last editor (company-side docs) ===
ALTER TABLE acc_portal_kyc_uploads
  ADD COLUMN IF NOT EXISTS uploaded_by     jsonb,
  ADD COLUMN IF NOT EXISTS updated_by_id   TEXT;

-- === document_review_history: reviewer id on each review row ===
ALTER TABLE document_review_history
  ADD COLUMN IF NOT EXISTS reviewer_id   TEXT;

-- === document_workflow_logs: who resolved / reverted a workflow log ===
ALTER TABLE document_workflow_logs
  ADD COLUMN IF NOT EXISTS updated_by_id   TEXT,
  ADD COLUMN IF NOT EXISTS reverted_by_id  TEXT;

-- === automation_jobs: who queued / cancelled an automation job ===
ALTER TABLE automation_jobs
  ADD COLUMN IF NOT EXISTS created_by_id    TEXT,
  ADD COLUMN IF NOT EXISTS cancelled_by_id  TEXT;
