-- One generic position-scope Job Profile for a single contract that covers a
-- probationary period followed by permanent employment, where the Parties
-- agree notice periods longer than the statutory minimums. Modelled on the
-- existing global "Standard Permanent Employment Contract" (4d936645-...) and
-- "Standard Probationary Employment Contract" (b31c43b2-...).
--
-- Only the statutory minimums are fixed on the profile:
--   probation_statutory_notice_period = 7 Days   (Employment Act 2007 s.42(4))
--   statutory_notice_period           = 1 Month  (s.35(1)(c), monthly-paid)
--
-- Everything period-related is left unset and entered per contract in the
-- Contract Fields panel (ContractEditor flags each as missing until filled):
--   contract_start_date      - first day of employment / probation
--   probation_period         - e.g. "4 Months"
--   probation_end_date       - last day of probation
--   probation_notice_period  - agreed notice during probation, e.g. "1 Month"
--   permanent_start_date     - first day of permanent employment
--   contract_end_date        - last day of the permanent term
--   notice_period            - agreed notice once permanent, e.g. "2 Months"
--
-- The source profiles and their clauses are left untouched. Section 0 only
-- fixes one typo in an existing clause.
--
-- Change company_id in `params` (section 4) to '10' (or another company) to
-- scope the profile to one company instead of making it global.

BEGIN;

-- ── 0. Typo fix in the existing Probation Appointment clause ──
-- {{job_itle}} is not a registered placeholder, so the job title never rendered.
UPDATE ec_clauses
SET content = replace(content, '{{job_itle}}', '{{job_title}}'), updated_at = now()
WHERE id = '41d81ef5-df9a-45d0-9fe6-84e1ea9b4da5'
  AND content LIKE '%{{job_itle}}%';

-- ── 1. Placeholders ──
-- probation_period / probation_end_date already exist but as unlinked
-- master_field placeholders, so they always rendered blank. Switching them to
-- settings_cascade lets profile settings or per-contract values supply them.
INSERT INTO ec_placeholders (key, label, group_label, source_kind, settings_key, editable)
VALUES
  ('contract_start_date',               'Contract Start Date',                 'Custom', 'settings_cascade', 'Job Profile Settings', true),
  ('probation_period',                  'Probation Period',                    'Custom', 'settings_cascade', 'Job Profile Settings', true),
  ('probation_end_date',                'Probation End Date',                  'Custom', 'settings_cascade', 'Job Profile Settings', true),
  ('probation_notice_period',           'Probation Notice Period (Agreed)',    'Custom', 'settings_cascade', 'Job Profile Settings', true),
  ('probation_statutory_notice_period', 'Probation Notice Period (Statutory)', 'Custom', 'settings_cascade', 'Job Profile Settings', true),
  ('permanent_start_date',              'Permanent Start Date',                'Custom', 'settings_cascade', 'Job Profile Settings', true),
  ('contract_end_date',                 'Contract End Date',                   'Custom', 'settings_cascade', 'Job Profile Settings', true),
  ('statutory_notice_period',           'Notice Period (Statutory)',           'Custom', 'settings_cascade', 'Job Profile Settings', true)
ON CONFLICT (key) DO UPDATE
SET source_kind     = EXCLUDED.source_kind,
    settings_key    = EXCLUDED.settings_key,
    master_field_id = NULL,
    updated_at      = now();

-- ── 2. New clauses (global, company_id NULL) ──
-- UNIQUE (section_key, clause_key, company_id) doesn't catch NULL company_id,
-- so guard with NOT EXISTS to keep this re-runnable.
INSERT INTO ec_clauses (section_key, clause_key, label, content, is_default, company_id)
SELECT v.section_key, v.clause_key, v.label, v.content, false, NULL
FROM (VALUES
  ('heading', 'probation_to_permanent_heading', 'Probation to Permanent Heading',
   '<h1>PROBATIONARY AND PERMANENT EMPLOYMENT CONTRACT</h1><p></p>'),

  ('appointment', 'probation_to_permanent_appointment', 'Probation to Permanent Appointment',
   '<p>The Employer hereby appoints the Employee as <strong>{{job_title}}</strong> in the <strong>{{department}}</strong> department, reporting to <strong>{{reports_to}}</strong>, commencing on <strong>{{contract_start_date}}</strong>.</p>'
   || '<p><strong>(a) Probationary Period</strong></p>'
   || '<p>The first <strong>{{probation_period}}</strong> of employment, from <strong>{{contract_start_date}}</strong> to <strong>{{probation_end_date}}</strong>, shall be a probationary period. During this period the Employee shall be assessed on their performance, conduct, competence, suitability for the position, adherence to Company policies, and ability to meet the requirements of the role.</p>'
   || '<p><strong>(b) Permanent Employment</strong></p>'
   || '<p>Subject to the Employee satisfactorily completing the probationary period and the Employer confirming the appointment in writing, the Employee shall be employed on a permanent basis for the period commencing on <strong>{{permanent_start_date}}</strong> and ending on <strong>{{contract_end_date}}</strong>, unless terminated earlier or renewed in accordance with this Contract.</p>'
   || '<p>The Employee''s continuous service shall be counted from <strong>{{contract_start_date}}</strong>, including the probationary period.</p>'
   || '<p>The Employee accepts the appointment and agrees to faithfully, diligently and professionally perform the duties and responsibilities assigned to the position in accordance with this Contract, the Employer''s policies and procedures, and applicable laws of Kenya.</p>'
   || '<p>The Employee shall devote the required working time and attention to the proper performance of their duties and shall act in the best interests of the Employer throughout the employment relationship.</p>'),

  ('performance', 'probation_to_permanent_performance', 'Probation to Permanent Performance',
   '<p><strong>(a) During Probation</strong></p>'
   || '<p>The Employee''s performance shall be assessed throughout the probationary period through formal or informal reviews. The assessment may consider:</p>'
   || '<ul><li><p>quality and accuracy of work;</p></li><li><p>productivity and ability to meet deadlines;</p></li><li><p>technical or professional competence;</p></li><li><p>attendance and punctuality;</p></li><li><p>communication and teamwork;</p></li><li><p>compliance with Company policies and procedures;</p></li><li><p>conduct and professionalism;</p></li><li><p>responsiveness to supervision and feedback; and</p></li><li><p>overall suitability for the position.</p></li></ul>'
   || '<p>At or before the end of the probationary period, the Employer may:</p>'
   || '<p><strong>i. Confirm the Employee''s appointment</strong> where the Employee has satisfactorily met the requirements of the position;</p>'
   || '<p><strong>ii. Extend the probationary period</strong> where legally permissible and with the Employee''s agreement; or</p>'
   || '<p><strong>iii. Terminate the employment</strong> in accordance with applicable law and the termination provisions of this Contract.</p>'
   || '<p>Confirmation, extension or termination shall be communicated to the Employee in writing.</p>'
   || '<p><strong>(b) After Confirmation</strong></p>'
   || '<p>The Employee shall be subject to periodic performance reviews in accordance with the Employer''s Performance Management Policy, conducted annually unless otherwise communicated in writing. Performance expectations will be communicated at the start of each review period, and appraisals will be conducted fairly and in accordance with the principles of natural justice. Failure to meet performance standards may result in action under the Employer''s Disciplinary Policy.</p>'),

  ('termination', 'probation_to_permanent_termination', 'Probation to Permanent Termination (Agreed Notice)',
   '<p>This Contract may be terminated in accordance with the terms of this Contract and the applicable laws of the Republic of Kenya.</p>'
   || '<p><strong>(a) Notice During Probation</strong></p>'
   || '<p>Under section 42(4) of the Employment Act, 2007, a probationary contract may be terminated by either Party on not less than <strong>{{probation_statutory_notice_period}}</strong> notice. The Parties have mutually agreed to a longer period: during the probationary period, either Party may terminate this Contract by giving the other <strong>{{probation_notice_period}}</strong> written notice, or by making or receiving payment of wages in lieu of such notice.</p>'
   || '<p><strong>(b) Notice After Confirmation</strong></p>'
   || '<p>Under section 35(1)(c) of the Employment Act, 2007, the statutory minimum notice once the Employee is employed on a permanent basis is <strong>{{statutory_notice_period}}</strong>. The Parties have mutually agreed to a longer period: after confirmation, either Party may terminate this Contract by giving the other <strong>{{notice_period}}</strong> written notice, or by making or receiving payment in lieu of such notice, in accordance with applicable law.</p>'
   || '<p><strong>(c) End of Probation</strong></p>'
   || '<p>The probationary period shall end on <strong>{{probation_end_date}}</strong> unless the Employee is confirmed earlier, the period is lawfully extended with the Employee''s agreement, or the employment is terminated in accordance with this Contract. The Employee shall not remain on probation beyond the maximum period permitted by applicable law.</p>'
   || '<p><strong>(d) Expiry and Renewal</strong></p>'
   || '<p>This Contract shall expire on <strong>{{contract_end_date}}</strong> unless renewed or extended by written agreement of the Parties before that date.</p>'
   || '<p><strong>(e) Termination for Misconduct or Other Lawful Cause</strong></p>'
   || '<p>The Employer may terminate the Employee''s employment, including by summary dismissal where permitted by law, where the Employee has committed an act or omission that constitutes lawful grounds for termination or summary dismissal under applicable law, such as serious or gross misconduct, wilful disobedience of a lawful and proper command, fraud or dishonesty, or conduct fundamentally inconsistent with the Employee''s duties.</p>'
   || '<p>Where the law requires the Employer to follow a disciplinary or termination procedure, the Employer shall comply with it, including giving the Employee an opportunity to respond to allegations made against them.</p>'
   || '<p><strong>(f) Constructive Dismissal</strong></p>'
   || '<p>Where the Employer fundamentally breaches the terms of the employment relationship, the Employee may have such rights and remedies as may be available under applicable Kenyan law.</p>'
   || '<p><strong>(g) Final Dues and Return of Company Property</strong></p>'
   || '<p>Upon termination of employment, the Employer shall process the Employee''s final dues and applicable employment documentation in accordance with applicable law.</p>'
   || '<p>The Employee shall return all Company property, documents, equipment, records, access credentials and other materials belonging to the Employer that are in the Employee''s possession or control.</p>')
) AS v(section_key, clause_key, label, content)
WHERE NOT EXISTS (
  SELECT 1 FROM ec_clauses c
  WHERE c.section_key = v.section_key AND c.clause_key = v.clause_key AND c.company_id IS NULL
);

-- ── 3. Helper: global clause id by section + clause_key ──
CREATE TEMP TABLE _clause_ids ON COMMIT DROP AS
SELECT section_key, clause_key, id::text AS id
FROM ec_clauses
WHERE company_id IS NULL;

-- ── 4. The merged profile ──
-- Starts from the permanent profile (standard parties, general provisions,
-- signatures, appendix, 21 days' leave) and swaps in the merged heading /
-- appointment / performance / termination clauses plus the probation
-- acceptance clause, which also acknowledges the probationary terms.
WITH params AS (SELECT NULL::text AS company_id),
perm  AS (SELECT * FROM ec_job_profiles WHERE id = '4d936645-d7b3-4b9e-ab1d-37edbb00c3ef'),
prob  AS (SELECT * FROM ec_job_profiles WHERE id = 'b31c43b2-eb89-4d3b-9fba-ff3d2ec7c1f1')
INSERT INTO ec_job_profiles (
  scope, company_id, name, settings, section_clauses, theme_settings, is_active,
  requirements, key_responsibilities, skills, tags, equipment
)
SELECT
  'position',
  p.company_id,
  'Probation to Permanent Employment Contract',
  -- notice_period dropped so the agreed period is entered per contract
  -- instead of inheriting the source's statutory '1 Month'.
  (perm.settings - 'notice_period') || jsonb_build_object(
    'reports_to',                        prob.settings->>'reports_to',
    'probation_statutory_notice_period', '7 Days',   -- Employment Act s.42(4)
    'statutory_notice_period',           '1 Month'   -- Employment Act s.35(1)(c)
  ),
  perm.section_clauses || jsonb_build_object(
    'heading',     (SELECT id FROM _clause_ids WHERE section_key = 'heading'     AND clause_key = 'probation_to_permanent_heading'),
    'appointment', (SELECT id FROM _clause_ids WHERE section_key = 'appointment' AND clause_key = 'probation_to_permanent_appointment'),
    'performance', (SELECT id FROM _clause_ids WHERE section_key = 'performance' AND clause_key = 'probation_to_permanent_performance'),
    'termination', (SELECT id FROM _clause_ids WHERE section_key = 'termination' AND clause_key = 'probation_to_permanent_termination'),
    'acceptance',  prob.section_clauses->>'acceptance'
  ),
  perm.theme_settings,
  true,
  perm.requirements, perm.key_responsibilities, perm.skills, perm.tags, perm.equipment
FROM perm, prob, params p
WHERE NOT EXISTS (
  SELECT 1 FROM ec_job_profiles j
  WHERE j.name = 'Probation to Permanent Employment Contract'
    AND j.company_id IS NOT DISTINCT FROM p.company_id
);

COMMIT;
