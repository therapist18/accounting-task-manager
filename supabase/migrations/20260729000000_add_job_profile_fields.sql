-- Adds the remaining Job Profile fields needed for the live-editable Job
-- Profiles page: a human-facing code/family for org taxonomy, a default
-- contract template pick, and three tag-style lists (skills, tags,
-- equipment) that are genuinely useful and editable, unlike the purely
-- decorative "Key Competencies %" / "Contract Theme" concepts that were
-- dropped instead of getting a backing column.
ALTER TABLE ec_job_profiles
  ADD COLUMN job_code TEXT,
  ADD COLUMN job_family TEXT,
  ADD COLUMN work_location TEXT,
  ADD COLUMN default_template_id UUID REFERENCES ec_contract_templates(id) ON DELETE SET NULL,
  ADD COLUMN skills TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN tags TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN equipment TEXT[] NOT NULL DEFAULT '{}';
