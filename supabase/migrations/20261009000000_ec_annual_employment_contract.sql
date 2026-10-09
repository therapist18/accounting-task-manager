-- Turns "Standard Permanent Employment Contract" into a strictly annual
-- contract: renamed "Annual Employment Contract", a fixed 12-month term that
-- is renewed year by year, and no probation (probation lives in the separate
-- "Probation to Permanent Employment Contract" profile).
--
-- The profile's existing clauses for heading / appointment / termination are
-- shared with other profiles (standard_heading is also used by the Standard
-- Probationary profile, standard_appointment / standard_termination by the
-- position profiles), so they are left untouched - the annual profile is
-- pointed at three new clauses instead. Its other clauses already contain no
-- probation wording and are kept as they are.
--
-- Per-contract fields (Contract Fields panel): contract_start_date,
-- contract_end_date (both already registered settings_cascade placeholders),
-- notice_period (profile default 1 Month, dropdown per contract).

BEGIN;

-- ── 1. New clauses (global, company_id NULL; re-runnable) ──
INSERT INTO ec_clauses (section_key, clause_key, label, content, is_default, company_id)
SELECT v.section_key, v.clause_key, v.label, v.content, false, NULL
FROM (VALUES
  ('heading', 'annual_heading', 'Annual Heading',
   '<h1>ANNUAL EMPLOYMENT CONTRACT</h1><p></p>'),

  ('appointment', 'annual_appointment', 'Annual Appointment',
   '<p>The Employer hereby appoints the Employee as <strong>{{job_title}}</strong> on an <strong>annual fixed-term</strong> basis for a term of twelve (12) months, commencing on <strong>{{contract_start_date}}</strong> and ending on <strong>{{contract_end_date}}</strong> (the "<strong>Contract Term</strong>"), unless terminated earlier in accordance with this Contract.</p>'
   || '<p>This Contract is not subject to a probationary period.</p>'
   || '<p><strong>Annual Renewal.</strong> This Contract is renewed on a yearly basis. Before the end of each Contract Term, the Employer shall notify the Employee in writing, not less than one (1) month before <strong>{{contract_end_date}}</strong>, whether it intends to offer a renewal. A renewal takes effect only when agreed in writing by both Parties, and shall be for a further twelve (12) month term on the terms of this Contract unless varied in that written renewal. Nothing in this Contract creates an entitlement to, or an expectation of, renewal.</p>'
   || '<p>Where the Contract is renewed, the Employee''s continuous service with the Employer shall be counted from <strong>{{employment_start_date}}</strong>.</p>'
   || '<p>The Employee accepts the appointment and agrees to faithfully, diligently and professionally perform the duties and responsibilities assigned to the position in accordance with this Contract, the Employer''s policies and procedures, and applicable laws of Kenya.</p>'
   || '<p>The Employee shall devote the required working time and attention to the proper performance of their duties and shall act in the best interests of the Employer throughout the employment relationship.</p>'),

  ('termination', 'annual_termination', 'Annual Termination',
   '<p>This Contract may be terminated in accordance with the terms of this Contract and the applicable laws of the Republic of Kenya.</p>'
   || '<p><strong>(a) Expiry</strong></p>'
   || '<p>This Contract shall end automatically on <strong>{{contract_end_date}}</strong> unless it has been renewed in writing in accordance with the Annual Renewal provisions of this Contract. Expiry of the Contract Term without renewal is not a termination by either Party and requires no further notice.</p>'
   || '<p><strong>(b) Early Termination by Notice</strong></p>'
   || '<p>Either Party may terminate this Contract before the end of the Contract Term by giving the other Party <strong>{{notice_period}}</strong> written notice, being not less than the minimum notice required under section 35 of the Employment Act, 2007, or by making or receiving payment in lieu of such notice, as applicable and in accordance with applicable law.</p>'
   || '<p><strong>(c) Termination by the Employer for Misconduct or Other Lawful Cause</strong></p>'
   || '<p>The Employer may terminate the Employee''s employment, including by summary dismissal where permitted by law, where the Employee has committed an act or omission that constitutes lawful grounds for termination or summary dismissal under applicable law, such as serious or gross misconduct, wilful disobedience of a lawful and proper command, fraud or dishonesty, or conduct fundamentally inconsistent with the Employee''s duties or obligations.</p>'
   || '<p>Where the law requires the Employer to follow a disciplinary or termination procedure, the Employer shall comply with the applicable procedural requirements, including giving the Employee an opportunity to respond to allegations made against them.</p>'
   || '<p><strong>(d) Constructive Dismissal</strong></p>'
   || '<p>Where the Employer fundamentally breaches the terms of the employment relationship, the Employee may have such rights and remedies as may be available under applicable Kenyan law.</p>'
   || '<p><strong>(e) Final Dues and Return of Company Property</strong></p>'
   || '<p>Upon expiry or termination of this Contract, the Employer shall process the Employee''s final dues and applicable employment documentation in accordance with applicable law.</p>'
   || '<p>The Employee shall return all Company property, documents, equipment, records and other materials belonging to the Employer that are in their possession or control.</p>')
) AS v(section_key, clause_key, label, content)
WHERE NOT EXISTS (
  SELECT 1 FROM ec_clauses c
  WHERE c.section_key = v.section_key AND c.clause_key = v.clause_key AND c.company_id IS NULL
);

-- ── 2. Rename + repoint both copies (global and company 10) ──
UPDATE ec_job_profiles
SET name = 'Annual Employment Contract',
    section_clauses = section_clauses || jsonb_build_object(
      'heading',     (SELECT id::text FROM ec_clauses WHERE section_key = 'heading'     AND clause_key = 'annual_heading'     AND company_id IS NULL),
      'appointment', (SELECT id::text FROM ec_clauses WHERE section_key = 'appointment' AND clause_key = 'annual_appointment' AND company_id IS NULL),
      'termination', (SELECT id::text FROM ec_clauses WHERE section_key = 'termination' AND clause_key = 'annual_termination' AND company_id IS NULL)
    ),
    -- Strictly no probation: drop any probation settings that might have
    -- been added to the profile.
    settings = settings - 'probation_period' - 'probation_notice' - 'probation_notice_period' - 'probation_end_date',
    updated_at = now()
WHERE id IN ('4d936645-d7b3-4b9e-ab1d-37edbb00c3ef', '3910a58f-a33f-48b8-b025-1f78056373c9');

-- ── 3. Fix: the Standard Probationary profiles used the PERMANENT heading ──
UPDATE ec_job_profiles
SET section_clauses = section_clauses || jsonb_build_object(
      'heading', (SELECT id::text FROM ec_clauses WHERE section_key = 'heading' AND clause_key = 'probationary_heading' AND company_id IS NULL)
    ),
    updated_at = now()
WHERE id IN ('b31c43b2-eb89-4d3b-9fba-ff3d2ec7c1f1', '80b2e029-1037-4a6d-a978-85c258fcf184');

COMMIT;
