-- Wires the Job Profile editor's Responsibilities tab
-- (ec_job_profiles.key_responsibilities - always writable, never previously
-- read by anything) into Appendix A of the generated contract, instead of
-- leaving that data captured but unused. See utils/standardPlaceholders.ts's
-- new key_responsibilities token (5th precedence layer, sourced directly off
-- the selected EcJobProfile row, not the settings cascade or a master field).
--
-- Deliberately NOT wiring ec_job_profiles.requirements ("Qualifications &
-- Experience") in here too - a contract records what the Employee has agreed
-- to DO (their duties), not what was required of candidates during
-- recruitment. Requirements stays captured on the Job Profile for
-- recruitment/reference purposes, just not rendered into the contract.
--
-- New source_kind value 'job_profile' - a structured column on the selected
-- Job Profile itself, reusing the settings_key column to name which
-- EcJobProfile field to read (see ecPlaceholders.ts's PlaceholderSourceKind
-- comment). Distinct from 'settings_cascade' (JSONB, 4-level inheritance).
ALTER TABLE ec_placeholders DROP CONSTRAINT ec_placeholders_source_kind_check;
ALTER TABLE ec_placeholders ADD CONSTRAINT ec_placeholders_source_kind_check
  CHECK (source_kind IN ('master_field', 'settings_cascade', 'offer', 'job_profile'));

INSERT INTO ec_placeholders (key, label, group_label, source_kind, settings_key, editable) VALUES
  ('key_responsibilities', 'Key Responsibilities', 'Job Description', 'job_profile', 'key_responsibilities', false);

UPDATE ec_clauses
SET content = '<div class="appendix">
  <h2>APPENDIX A – DETAILED JOB DESCRIPTION</h2>
  <table class="details-table">
    <tr><td class="label-cell">Job Title</td><td>{{job_title}}</td></tr>
    <tr><td class="label-cell">Department</td><td>{{department}}</td></tr>
    <tr><td class="label-cell">Reports To</td><td>{{reports_to}}</td></tr>
    <tr><td class="label-cell">Job Level</td><td>{{job_level}}</td></tr>
    <tr><td class="label-cell">Employment Type</td><td>{{employment_type}}</td></tr>
  </table>
  <h3>Key Responsibilities</h3>
  <ul>
    {{key_responsibilities}}
  </ul>
  <p class="appendix-note"><em>The Employee acknowledges that the above sets out the principal duties associated with the position. The Employer may reasonably assign additional duties consistent with the Employee''s position, qualifications and experience, subject to applicable law.</em></p>
</div>',
    updated_at = now()
WHERE section_key = 'appendix_job_description' AND clause_key = 'standard_job_description';
