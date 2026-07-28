-- Adds free-text job content to ec_job_profiles so position-scope profiles can
-- carry a full job description, requirements, and key responsibilities - shown
-- in the Job Profiles detail panel alongside the existing settings/clauses.
ALTER TABLE ec_job_profiles
  ADD COLUMN job_description TEXT,
  ADD COLUMN requirements TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN key_responsibilities TEXT[] NOT NULL DEFAULT '{}';
