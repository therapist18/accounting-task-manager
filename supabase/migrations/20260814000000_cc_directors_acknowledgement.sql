-- Consultancy Contracts: lets the admin pick which of a client company's
-- registered directors/shareholders (registry_individuals.employment_data.
-- associations, the same director/shareholder filter the Letter Generation
-- Engine already applies in letters/hooks/useLetterData.ts) are party to the
-- engagement, instead of the "Company Directors Acknowledgement and
-- Acceptance" section always being two blank hand-fill lines. Selection
-- persists per-engagement, alongside placeholder_overrides.
ALTER TABLE cc_engagements
  ADD COLUMN IF NOT EXISTS selected_director_ids JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Swap the two hardcoded blank director rows the seed migration wrote
-- (20260813000001_seed_cc_template_and_placeholders.sql) for the new
-- {{directors_acknowledgement_block}} token - see app/(dashboard)/dashboard/
-- consultancy-contracts/utils/directorsBlock.ts, which renders one
-- Name/Sign/Date row per director selected in the new picker (however many
-- that is, not fixed at two). Matched with a whitespace-tolerant regexp
-- rather than a literal string so CRLF/LF differences can't make this
-- silently no-op; only fires when the section is still exactly the
-- seeded two-row block, so a template an admin has since hand-edited in
-- Settings is left untouched.
UPDATE cc_templates
SET content = regexp_replace(
  content,
  '(<p>Director''s Name: _+</p>\s*<p>Sign: _+ Date: _+</p>\s*){2}',
  '{{directors_acknowledgement_block}}',
  'g'
)
WHERE content ~ '(<p>Director''s Name: _+</p>\s*<p>Sign: _+ Date: _+</p>\s*){2}';
