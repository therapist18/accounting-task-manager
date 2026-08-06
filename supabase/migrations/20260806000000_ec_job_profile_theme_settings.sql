-- Persists per-Job-Profile document theme settings (ContractThemeSettings in
-- utils/themeEngine.ts) so the theme/color/font/header choices can be saved
-- with a profile instead of being ephemeral, and applied whenever that
-- profile is used to generate a contract.
ALTER TABLE ec_job_profiles
  ADD COLUMN IF NOT EXISTS theme_settings JSONB NOT NULL DEFAULT '{}'::jsonb;
