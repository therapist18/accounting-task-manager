-- Data fix: source_kind = 'job_profile' is meant for a literal column on the
-- EcJobProfile row itself (e.g. key_responsibilities/requirements - see
-- standardPlaceholders.ts's generic resolver, which reads
-- (jobProfile as any)[settings_key] for this kind). Most rows tagged
-- 'job_profile' (e.g. annual_leave_days, break_duration) don't correspond to
-- any real EcJobProfile column - their data actually lives in the .settings
-- JSONB cascade, which is what source_kind = 'settings_cascade' reads
-- (effectiveSettings[settings_key]). Those rows have therefore never
-- resolved to anything in a generated contract, and the Job Profiles
-- "Fields" tab (which edits draft.settings) couldn't show them either.
--
-- Reassigns any 'job_profile' row whose effective key isn't one of the real
-- structured EcJobProfile columns to 'settings_cascade', and backfills
-- settings_key = key wherever still null - same convention
-- 20260731000003_ec_placeholder_settings_key_backfill.sql already
-- established for rows that predated it; this catches rows created since.
UPDATE ec_placeholders
SET
  source_kind = 'settings_cascade',
  settings_key = COALESCE(NULLIF(settings_key, ''), key),
  updated_at = now()
WHERE source_kind = 'job_profile'
  AND COALESCE(NULLIF(settings_key, ''), key) NOT IN (
    'requirements', 'key_responsibilities', 'skills', 'tags', 'equipment'
  );
