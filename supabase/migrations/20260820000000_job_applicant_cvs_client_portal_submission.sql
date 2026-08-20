-- The CV Builder's client portal previously saved a candidate's submitted
-- edits into raw_cv_extracted_details, the same column that holds the
-- original AI-extracted CV from the initial upload. That column is read as
-- a fallback source when the recruiter's edited snapshot has blank
-- skills/certifications, so any client submission silently destroyed the
-- original extraction it depended on. Give client submissions their own
-- column instead.
ALTER TABLE job_applicant_cvs
  ADD COLUMN IF NOT EXISTS client_portal_submission JSONB;
