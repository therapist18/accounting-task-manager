-- Seed default job profiles for company_id '10' (edit company_id to match your setup).
-- Runs AFTER 20260722000001_seed_default_clauses.sql (clause IDs referenced via subqueries).
--
-- Structure:
--   1 × company-scope  (Company Defaults)
--   2 × department-scope (Finance, IT)
--   5 × position-scope  (Accountant, Developer, HR Officer, Admin Assistant, Sales Rep)

-- Helper: resolve a clause ID by clause_key (global, is_default = true)
-- Used inline below so section_clauses always point to real clause rows.
--
-- NOTE: section_clauses is built with jsonb_build_object(...), not a
-- '{...}'::jsonb string literal - a jsonb literal is static JSON text, and
-- JSON has no syntax for "the result of this subquery" as a value. Every
-- (SELECT ...) here has to be a real SQL expression passed as a function
-- argument so Postgres evaluates it, not text sitting inside a quoted
-- string (which is what caused the "syntax error at or near ..." - the
-- nested single-quotes around each clause_key were closing the outer
-- string literal early).

-- ─── 1. COMPANY DEFAULTS ──────────────────────────────────────────────────────
INSERT INTO ec_job_profiles (
  scope, company_id, name, department, job_title, employment_type, job_level, work_arrangement,
  settings, section_clauses, is_active
) VALUES (
  'company', '10', 'Company Defaults', NULL, NULL, NULL, NULL, NULL,
  '{
    "notice_period": "1 month",
    "probation_period": "3 months",
    "probation_notice": "1 week",
    "working_days": "Monday to Friday",
    "working_hours": "40 hours",
    "start_time": "08:30 AM",
    "end_time": "05:00 PM",
    "break_duration": "1 hour",
    "rest_days": "Saturday and Sunday",
    "work_mode": "Office-based",
    "payment_frequency": "Monthly",
    "payment_day": "28th",
    "annual_leave_days": "21",
    "medical_cover": "NHIF outpatient cover",
    "pension_scheme": "Company pension contribution of 5% employer / 5% employee",
    "reports_to": "As assigned by management",
    "work_location": "Company headquarters, Nairobi"
  }'::jsonb,
  jsonb_build_object(
    'heading',                    (SELECT id FROM ec_clauses WHERE clause_key = 'standard_heading'                AND company_id IS NULL AND is_default = true LIMIT 1),
    'parties',                    (SELECT id FROM ec_clauses WHERE clause_key = 'standard_parties'                AND company_id IS NULL AND is_default = true LIMIT 1),
    'appointment',                (SELECT id FROM ec_clauses WHERE clause_key = 'standard_appointment'            AND company_id IS NULL AND is_default = true LIMIT 1),
    'place_of_work',              (SELECT id FROM ec_clauses WHERE clause_key = 'standard_place_of_work'          AND company_id IS NULL AND is_default = true LIMIT 1),
    'duties',                     (SELECT id FROM ec_clauses WHERE clause_key = 'standard_duties'                 AND company_id IS NULL AND is_default = true LIMIT 1),
    'working_hours',              (SELECT id FROM ec_clauses WHERE clause_key = 'standard_office_hours'           AND company_id IS NULL AND is_default = true LIMIT 1),
    'remuneration',                (SELECT id FROM ec_clauses WHERE clause_key = 'standard_remuneration'           AND company_id IS NULL AND is_default = true LIMIT 1),
    'benefits',                   (SELECT id FROM ec_clauses WHERE clause_key = 'standard_benefits'               AND company_id IS NULL AND is_default = true LIMIT 1),
    'statutory_deductions',       (SELECT id FROM ec_clauses WHERE clause_key = 'standard_statutory_deductions'   AND company_id IS NULL AND is_default = true LIMIT 1),
    'leave',                      (SELECT id FROM ec_clauses WHERE clause_key = 'standard_leave'                  AND company_id IS NULL AND is_default = true LIMIT 1),
    'employee_obligations',       (SELECT id FROM ec_clauses WHERE clause_key = 'standard_employee_obligations'   AND company_id IS NULL AND is_default = true LIMIT 1),
    'performance',                (SELECT id FROM ec_clauses WHERE clause_key = 'standard_performance'            AND company_id IS NULL AND is_default = true LIMIT 1),
    'termination',                (SELECT id FROM ec_clauses WHERE clause_key = 'standard_termination'            AND company_id IS NULL AND is_default = true LIMIT 1),
    'general_provisions',         (SELECT id FROM ec_clauses WHERE clause_key = 'standard_general_provisions'     AND company_id IS NULL AND is_default = true LIMIT 1),
    'acceptance',                 (SELECT id FROM ec_clauses WHERE clause_key = 'standard_acceptance'             AND company_id IS NULL AND is_default = true LIMIT 1),
    'signatures',                 (SELECT id FROM ec_clauses WHERE clause_key = 'standard_signatures'             AND company_id IS NULL AND is_default = true LIMIT 1),
    'appendix_job_description',   (SELECT id FROM ec_clauses WHERE clause_key = 'standard_job_description'        AND company_id IS NULL AND is_default = true LIMIT 1),
    'appendix_salary_breakdown',  (SELECT id FROM ec_clauses WHERE clause_key = 'standard_salary_breakdown'       AND company_id IS NULL AND is_default = true LIMIT 1),
    'appendix_benefits_schedule', (SELECT id FROM ec_clauses WHERE clause_key = 'standard_benefits_schedule'      AND company_id IS NULL AND is_default = true LIMIT 1),
    'appendix_company_policies',  (SELECT id FROM ec_clauses WHERE clause_key = 'standard_company_policies'       AND company_id IS NULL AND is_default = true LIMIT 1),
    'appendix_equipment_issued',  (SELECT id FROM ec_clauses WHERE clause_key = 'standard_equipment_issued'       AND company_id IS NULL AND is_default = true LIMIT 1)
  ),
  true
);

-- ─── 2. DEPARTMENT DEFAULTS — FINANCE ─────────────────────────────────────────
INSERT INTO ec_job_profiles (
  scope, company_id, name, department, job_title, employment_type, job_level, work_arrangement,
  settings, section_clauses, is_active
) VALUES (
  'department', '10', 'Finance Department Defaults', 'Finance', NULL, NULL, NULL, NULL,
  '{
    "notice_period": "1 month",
    "probation_period": "3 months",
    "probation_notice": "1 week",
    "reports_to": "Head of Finance",
    "work_location": "Finance Department, 3rd Floor, Company HQ"
  }'::jsonb,
  '{}'::jsonb,
  true
);

-- ─── 3. DEPARTMENT DEFAULTS — IT ──────────────────────────────────────────────
INSERT INTO ec_job_profiles (
  scope, company_id, name, department, job_title, employment_type, job_level, work_arrangement,
  settings, section_clauses, is_active
) VALUES (
  'department', '10', 'IT Department Defaults', 'Information Technology', NULL, NULL, NULL, NULL,
  '{
    "notice_period": "1 month",
    "probation_period": "3 months",
    "probation_notice": "1 week",
    "working_hours": "40 hours",
    "reports_to": "Chief Technology Officer",
    "work_location": "IT Department, 4th Floor, Company HQ",
    "medical_cover": "NHIF + private medical insurance (AAR / Jubilee)"
  }'::jsonb,
  '{}'::jsonb,
  true
);

-- ─── 4. POSITION — ACCOUNTANT (Permanent, Finance, JG5) ───────────────────────
INSERT INTO ec_job_profiles (
  scope, company_id, name, department, job_title, employment_type, job_level, work_arrangement,
  settings, section_clauses, is_active
) VALUES (
  'position', '10', 'Accountant - Permanent - Finance - JG5', 'Finance', 'Accountant', 'Permanent', 'JG5', 'Office',
  '{
    "notice_period": "1 month",
    "probation_period": "3 months",
    "probation_notice": "1 week",
    "working_days": "Monday to Friday",
    "working_hours": "40 hours",
    "start_time": "08:30 AM",
    "end_time": "05:00 PM",
    "break_duration": "1 hour",
    "rest_days": "Saturday and Sunday",
    "payment_frequency": "Monthly",
    "payment_day": "28th",
    "annual_leave_days": "21",
    "medical_cover": "NHIF + AAR Medical Insurance",
    "pension_scheme": "Company pension contribution of 5% employer / 5% employee",
    "housing_allowance": "30% of basic salary",
    "transport_allowance": "KES 15,000",
    "telephone_allowance": "KES 5,000",
    "meal_allowance": "KES 5,000",
    "reports_to": "Finance Manager",
    "work_location": "Finance Department, 3rd Floor, Company HQ"
  }'::jsonb,
  jsonb_build_object(
    'heading',                    (SELECT id FROM ec_clauses WHERE clause_key = 'standard_heading'                AND company_id IS NULL AND is_default = true LIMIT 1),
    'parties',                    (SELECT id FROM ec_clauses WHERE clause_key = 'standard_parties'                AND company_id IS NULL AND is_default = true LIMIT 1),
    'appointment',                (SELECT id FROM ec_clauses WHERE clause_key = 'standard_appointment'            AND company_id IS NULL AND is_default = true LIMIT 1),
    'place_of_work',              (SELECT id FROM ec_clauses WHERE clause_key = 'standard_place_of_work'          AND company_id IS NULL AND is_default = true LIMIT 1),
    'duties',                     (SELECT id FROM ec_clauses WHERE clause_key = 'standard_duties'                 AND company_id IS NULL AND is_default = true LIMIT 1),
    'working_hours',              (SELECT id FROM ec_clauses WHERE clause_key = 'standard_office_hours'           AND company_id IS NULL AND is_default = true LIMIT 1),
    'remuneration',                (SELECT id FROM ec_clauses WHERE clause_key = 'standard_remuneration'           AND company_id IS NULL AND is_default = true LIMIT 1),
    'benefits',                   (SELECT id FROM ec_clauses WHERE clause_key = 'standard_benefits'               AND company_id IS NULL AND is_default = true LIMIT 1),
    'statutory_deductions',       (SELECT id FROM ec_clauses WHERE clause_key = 'standard_statutory_deductions'   AND company_id IS NULL AND is_default = true LIMIT 1),
    'leave',                      (SELECT id FROM ec_clauses WHERE clause_key = 'standard_leave'                  AND company_id IS NULL AND is_default = true LIMIT 1),
    'employee_obligations',       (SELECT id FROM ec_clauses WHERE clause_key = 'standard_employee_obligations'   AND company_id IS NULL AND is_default = true LIMIT 1),
    'performance',                (SELECT id FROM ec_clauses WHERE clause_key = 'standard_performance'            AND company_id IS NULL AND is_default = true LIMIT 1),
    'termination',                (SELECT id FROM ec_clauses WHERE clause_key = 'standard_termination'            AND company_id IS NULL AND is_default = true LIMIT 1),
    'general_provisions',         (SELECT id FROM ec_clauses WHERE clause_key = 'standard_general_provisions'     AND company_id IS NULL AND is_default = true LIMIT 1),
    'acceptance',                 (SELECT id FROM ec_clauses WHERE clause_key = 'standard_acceptance'             AND company_id IS NULL AND is_default = true LIMIT 1),
    'signatures',                 (SELECT id FROM ec_clauses WHERE clause_key = 'standard_signatures'             AND company_id IS NULL AND is_default = true LIMIT 1),
    'appendix_job_description',   (SELECT id FROM ec_clauses WHERE clause_key = 'standard_job_description'        AND company_id IS NULL AND is_default = true LIMIT 1),
    'appendix_salary_breakdown',  (SELECT id FROM ec_clauses WHERE clause_key = 'standard_salary_breakdown'       AND company_id IS NULL AND is_default = true LIMIT 1),
    'appendix_benefits_schedule', (SELECT id FROM ec_clauses WHERE clause_key = 'standard_benefits_schedule'      AND company_id IS NULL AND is_default = true LIMIT 1),
    'appendix_company_policies',  (SELECT id FROM ec_clauses WHERE clause_key = 'standard_company_policies'       AND company_id IS NULL AND is_default = true LIMIT 1),
    'appendix_equipment_issued',  (SELECT id FROM ec_clauses WHERE clause_key = 'standard_equipment_issued'       AND company_id IS NULL AND is_default = true LIMIT 1)
  ),
  true
);

-- ─── 5. POSITION — SOFTWARE DEVELOPER (Permanent, IT, JG4) ────────────────────
INSERT INTO ec_job_profiles (
  scope, company_id, name, department, job_title, employment_type, job_level, work_arrangement,
  settings, section_clauses, is_active
) VALUES (
  'position', '10', 'Software Developer - Permanent - IT - JG4', 'Information Technology', 'Software Developer', 'Permanent', 'JG4', 'Hybrid',
  '{
    "notice_period": "1 month",
    "probation_period": "3 months",
    "probation_notice": "1 week",
    "working_days": "Monday to Friday",
    "working_hours": "40 hours",
    "start_time": "09:00 AM",
    "end_time": "05:00 PM",
    "break_duration": "1 hour",
    "rest_days": "Saturday and Sunday",
    "payment_frequency": "Monthly",
    "payment_day": "28th",
    "annual_leave_days": "21",
    "medical_cover": "NHIF + AAR Medical Insurance",
    "pension_scheme": "Company pension contribution of 5% employer / 5% employee",
    "housing_allowance": "25% of basic salary",
    "transport_allowance": "KES 12,000",
    "telephone_allowance": "KES 5,000",
    "meal_allowance": "KES 5,000",
    "reports_to": "Head of IT / CTO",
    "work_location": "Hybrid — 3 days office, 2 days remote"
  }'::jsonb,
  jsonb_build_object(
    'heading',                    (SELECT id FROM ec_clauses WHERE clause_key = 'standard_heading'                AND company_id IS NULL AND is_default = true LIMIT 1),
    'parties',                    (SELECT id FROM ec_clauses WHERE clause_key = 'standard_parties'                AND company_id IS NULL AND is_default = true LIMIT 1),
    'appointment',                (SELECT id FROM ec_clauses WHERE clause_key = 'standard_appointment'            AND company_id IS NULL AND is_default = true LIMIT 1),
    'place_of_work',              (SELECT id FROM ec_clauses WHERE clause_key = 'remote_place_of_work'            AND company_id IS NULL AND is_default = true LIMIT 1),
    'duties',                     (SELECT id FROM ec_clauses WHERE clause_key = 'standard_duties'                 AND company_id IS NULL AND is_default = true LIMIT 1),
    'working_hours',              (SELECT id FROM ec_clauses WHERE clause_key = 'flexible_hours'                  AND company_id IS NULL AND is_default = true LIMIT 1),
    'remuneration',                (SELECT id FROM ec_clauses WHERE clause_key = 'standard_remuneration'           AND company_id IS NULL AND is_default = true LIMIT 1),
    'benefits',                   (SELECT id FROM ec_clauses WHERE clause_key = 'standard_benefits'               AND company_id IS NULL AND is_default = true LIMIT 1),
    'statutory_deductions',       (SELECT id FROM ec_clauses WHERE clause_key = 'standard_statutory_deductions'   AND company_id IS NULL AND is_default = true LIMIT 1),
    'leave',                      (SELECT id FROM ec_clauses WHERE clause_key = 'standard_leave'                  AND company_id IS NULL AND is_default = true LIMIT 1),
    'employee_obligations',       (SELECT id FROM ec_clauses WHERE clause_key = 'standard_employee_obligations'   AND company_id IS NULL AND is_default = true LIMIT 1),
    'performance',                (SELECT id FROM ec_clauses WHERE clause_key = 'standard_performance'            AND company_id IS NULL AND is_default = true LIMIT 1),
    'termination',                (SELECT id FROM ec_clauses WHERE clause_key = 'standard_termination'            AND company_id IS NULL AND is_default = true LIMIT 1),
    'general_provisions',         (SELECT id FROM ec_clauses WHERE clause_key = 'standard_general_provisions'     AND company_id IS NULL AND is_default = true LIMIT 1),
    'acceptance',                 (SELECT id FROM ec_clauses WHERE clause_key = 'standard_acceptance'             AND company_id IS NULL AND is_default = true LIMIT 1),
    'signatures',                 (SELECT id FROM ec_clauses WHERE clause_key = 'standard_signatures'             AND company_id IS NULL AND is_default = true LIMIT 1),
    'appendix_job_description',   (SELECT id FROM ec_clauses WHERE clause_key = 'standard_job_description'        AND company_id IS NULL AND is_default = true LIMIT 1),
    'appendix_salary_breakdown',  (SELECT id FROM ec_clauses WHERE clause_key = 'standard_salary_breakdown'       AND company_id IS NULL AND is_default = true LIMIT 1),
    'appendix_benefits_schedule', (SELECT id FROM ec_clauses WHERE clause_key = 'standard_benefits_schedule'      AND company_id IS NULL AND is_default = true LIMIT 1),
    'appendix_company_policies',  (SELECT id FROM ec_clauses WHERE clause_key = 'standard_company_policies'       AND company_id IS NULL AND is_default = true LIMIT 1),
    'appendix_equipment_issued',  (SELECT id FROM ec_clauses WHERE clause_key = 'standard_equipment_issued'       AND company_id IS NULL AND is_default = true LIMIT 1)
  ),
  true
);

-- ─── 6. POSITION — HR OFFICER (Permanent, HR, JG4) ────────────────────────────
INSERT INTO ec_job_profiles (
  scope, company_id, name, department, job_title, employment_type, job_level, work_arrangement,
  settings, section_clauses, is_active
) VALUES (
  'position', '10', 'HR Officer - Permanent - Human Resources - JG4', 'Human Resources', 'HR Officer', 'Permanent', 'JG4', 'Office',
  '{
    "notice_period": "1 month",
    "probation_period": "3 months",
    "probation_notice": "1 week",
    "working_days": "Monday to Friday",
    "working_hours": "40 hours",
    "start_time": "08:30 AM",
    "end_time": "05:00 PM",
    "break_duration": "1 hour",
    "rest_days": "Saturday and Sunday",
    "payment_frequency": "Monthly",
    "payment_day": "28th",
    "annual_leave_days": "21",
    "medical_cover": "NHIF + AAR Medical Insurance",
    "pension_scheme": "Company pension contribution of 5% employer / 5% employee",
    "housing_allowance": "25% of basic salary",
    "transport_allowance": "KES 12,000",
    "telephone_allowance": "KES 5,000",
    "meal_allowance": "KES 5,000",
    "reports_to": "HR Manager",
    "work_location": "HR Department, 2nd Floor, Company HQ"
  }'::jsonb,
  jsonb_build_object(
    'heading',                    (SELECT id FROM ec_clauses WHERE clause_key = 'standard_heading'                AND company_id IS NULL AND is_default = true LIMIT 1),
    'parties',                    (SELECT id FROM ec_clauses WHERE clause_key = 'standard_parties'                AND company_id IS NULL AND is_default = true LIMIT 1),
    'appointment',                (SELECT id FROM ec_clauses WHERE clause_key = 'standard_appointment'            AND company_id IS NULL AND is_default = true LIMIT 1),
    'place_of_work',              (SELECT id FROM ec_clauses WHERE clause_key = 'standard_place_of_work'          AND company_id IS NULL AND is_default = true LIMIT 1),
    'duties',                     (SELECT id FROM ec_clauses WHERE clause_key = 'standard_duties'                 AND company_id IS NULL AND is_default = true LIMIT 1),
    'working_hours',              (SELECT id FROM ec_clauses WHERE clause_key = 'standard_office_hours'           AND company_id IS NULL AND is_default = true LIMIT 1),
    'remuneration',                (SELECT id FROM ec_clauses WHERE clause_key = 'standard_remuneration'           AND company_id IS NULL AND is_default = true LIMIT 1),
    'benefits',                   (SELECT id FROM ec_clauses WHERE clause_key = 'standard_benefits'               AND company_id IS NULL AND is_default = true LIMIT 1),
    'statutory_deductions',       (SELECT id FROM ec_clauses WHERE clause_key = 'standard_statutory_deductions'   AND company_id IS NULL AND is_default = true LIMIT 1),
    'leave',                      (SELECT id FROM ec_clauses WHERE clause_key = 'standard_leave'                  AND company_id IS NULL AND is_default = true LIMIT 1),
    'employee_obligations',       (SELECT id FROM ec_clauses WHERE clause_key = 'standard_employee_obligations'   AND company_id IS NULL AND is_default = true LIMIT 1),
    'performance',                (SELECT id FROM ec_clauses WHERE clause_key = 'standard_performance'            AND company_id IS NULL AND is_default = true LIMIT 1),
    'termination',                (SELECT id FROM ec_clauses WHERE clause_key = 'standard_termination'            AND company_id IS NULL AND is_default = true LIMIT 1),
    'general_provisions',         (SELECT id FROM ec_clauses WHERE clause_key = 'standard_general_provisions'     AND company_id IS NULL AND is_default = true LIMIT 1),
    'acceptance',                 (SELECT id FROM ec_clauses WHERE clause_key = 'standard_acceptance'             AND company_id IS NULL AND is_default = true LIMIT 1),
    'signatures',                 (SELECT id FROM ec_clauses WHERE clause_key = 'standard_signatures'             AND company_id IS NULL AND is_default = true LIMIT 1),
    'appendix_job_description',   (SELECT id FROM ec_clauses WHERE clause_key = 'standard_job_description'        AND company_id IS NULL AND is_default = true LIMIT 1),
    'appendix_salary_breakdown',  (SELECT id FROM ec_clauses WHERE clause_key = 'standard_salary_breakdown'       AND company_id IS NULL AND is_default = true LIMIT 1),
    'appendix_benefits_schedule', (SELECT id FROM ec_clauses WHERE clause_key = 'standard_benefits_schedule'      AND company_id IS NULL AND is_default = true LIMIT 1),
    'appendix_company_policies',  (SELECT id FROM ec_clauses WHERE clause_key = 'standard_company_policies'       AND company_id IS NULL AND is_default = true LIMIT 1),
    'appendix_equipment_issued',  (SELECT id FROM ec_clauses WHERE clause_key = 'standard_equipment_issued'       AND company_id IS NULL AND is_default = true LIMIT 1)
  ),
  true
);

-- ─── 7. POSITION — ADMINISTRATIVE ASSISTANT (Permanent, Admin, JG3) ───────────
INSERT INTO ec_job_profiles (
  scope, company_id, name, department, job_title, employment_type, job_level, work_arrangement,
  settings, section_clauses, is_active
) VALUES (
  'position', '10', 'Administrative Assistant - Permanent - Administration - JG3', 'Administration', 'Administrative Assistant', 'Permanent', 'JG3', 'Office',
  '{
    "notice_period": "1 month",
    "probation_period": "3 months",
    "probation_notice": "1 week",
    "working_days": "Monday to Friday",
    "working_hours": "40 hours",
    "start_time": "08:00 AM",
    "end_time": "05:00 PM",
    "break_duration": "1 hour",
    "rest_days": "Saturday and Sunday",
    "payment_frequency": "Monthly",
    "payment_day": "28th",
    "annual_leave_days": "21",
    "medical_cover": "NHIF only",
    "pension_scheme": "Company pension contribution of 5% employer / 5% employee",
    "housing_allowance": "20% of basic salary",
    "transport_allowance": "KES 8,000",
    "meal_allowance": "KES 3,000",
    "reports_to": "Office Manager",
    "work_location": "Reception Area, 1st Floor, Company HQ"
  }'::jsonb,
  jsonb_build_object(
    'heading',                    (SELECT id FROM ec_clauses WHERE clause_key = 'standard_heading'                AND company_id IS NULL AND is_default = true LIMIT 1),
    'parties',                    (SELECT id FROM ec_clauses WHERE clause_key = 'standard_parties'                AND company_id IS NULL AND is_default = true LIMIT 1),
    'appointment',                (SELECT id FROM ec_clauses WHERE clause_key = 'standard_appointment'            AND company_id IS NULL AND is_default = true LIMIT 1),
    'place_of_work',              (SELECT id FROM ec_clauses WHERE clause_key = 'standard_place_of_work'          AND company_id IS NULL AND is_default = true LIMIT 1),
    'duties',                     (SELECT id FROM ec_clauses WHERE clause_key = 'standard_duties'                 AND company_id IS NULL AND is_default = true LIMIT 1),
    'working_hours',              (SELECT id FROM ec_clauses WHERE clause_key = 'standard_office_hours'           AND company_id IS NULL AND is_default = true LIMIT 1),
    'remuneration',                (SELECT id FROM ec_clauses WHERE clause_key = 'standard_remuneration'           AND company_id IS NULL AND is_default = true LIMIT 1),
    'benefits',                   (SELECT id FROM ec_clauses WHERE clause_key = 'standard_benefits'               AND company_id IS NULL AND is_default = true LIMIT 1),
    'statutory_deductions',       (SELECT id FROM ec_clauses WHERE clause_key = 'standard_statutory_deductions'   AND company_id IS NULL AND is_default = true LIMIT 1),
    'leave',                      (SELECT id FROM ec_clauses WHERE clause_key = 'standard_leave'                  AND company_id IS NULL AND is_default = true LIMIT 1),
    'employee_obligations',       (SELECT id FROM ec_clauses WHERE clause_key = 'standard_employee_obligations'   AND company_id IS NULL AND is_default = true LIMIT 1),
    'performance',                (SELECT id FROM ec_clauses WHERE clause_key = 'standard_performance'            AND company_id IS NULL AND is_default = true LIMIT 1),
    'termination',                (SELECT id FROM ec_clauses WHERE clause_key = 'standard_termination'            AND company_id IS NULL AND is_default = true LIMIT 1),
    'general_provisions',         (SELECT id FROM ec_clauses WHERE clause_key = 'standard_general_provisions'     AND company_id IS NULL AND is_default = true LIMIT 1),
    'acceptance',                 (SELECT id FROM ec_clauses WHERE clause_key = 'standard_acceptance'             AND company_id IS NULL AND is_default = true LIMIT 1),
    'signatures',                 (SELECT id FROM ec_clauses WHERE clause_key = 'standard_signatures'             AND company_id IS NULL AND is_default = true LIMIT 1),
    'appendix_job_description',   (SELECT id FROM ec_clauses WHERE clause_key = 'standard_job_description'        AND company_id IS NULL AND is_default = true LIMIT 1),
    'appendix_salary_breakdown',  (SELECT id FROM ec_clauses WHERE clause_key = 'standard_salary_breakdown'       AND company_id IS NULL AND is_default = true LIMIT 1),
    'appendix_benefits_schedule', (SELECT id FROM ec_clauses WHERE clause_key = 'standard_benefits_schedule'      AND company_id IS NULL AND is_default = true LIMIT 1),
    'appendix_company_policies',  (SELECT id FROM ec_clauses WHERE clause_key = 'standard_company_policies'       AND company_id IS NULL AND is_default = true LIMIT 1),
    'appendix_equipment_issued',  (SELECT id FROM ec_clauses WHERE clause_key = 'standard_equipment_issued'       AND company_id IS NULL AND is_default = true LIMIT 1)
  ),
  true
);

-- ─── 8. POSITION — SALES REPRESENTATIVE (Permanent, Sales, JG3) ───────────────
INSERT INTO ec_job_profiles (
  scope, company_id, name, department, job_title, employment_type, job_level, work_arrangement,
  settings, section_clauses, is_active
) VALUES (
  'position', '10', 'Sales Representative - Permanent - Sales - JG3', 'Sales', 'Sales Representative', 'Permanent', 'JG3', 'Office',
  '{
    "notice_period": "1 month",
    "probation_period": "3 months",
    "probation_notice": "1 week",
    "working_days": "Monday to Friday",
    "working_hours": "40 hours",
    "start_time": "08:30 AM",
    "end_time": "05:30 PM",
    "break_duration": "1 hour",
    "rest_days": "Saturday and Sunday",
    "payment_frequency": "Monthly",
    "payment_day": "28th",
    "annual_leave_days": "21",
    "medical_cover": "NHIF only",
    "pension_scheme": "Company pension contribution of 5% employer / 5% employee",
    "housing_allowance": "20% of basic salary",
    "transport_allowance": "KES 10,000",
    "telephone_allowance": "KES 5,000",
    "meal_allowance": "KES 5,000",
    "reports_to": "Sales Manager",
    "work_location": "Sales Department, Ground Floor, Company HQ"
  }'::jsonb,
  jsonb_build_object(
    'heading',                    (SELECT id FROM ec_clauses WHERE clause_key = 'standard_heading'                AND company_id IS NULL AND is_default = true LIMIT 1),
    'parties',                    (SELECT id FROM ec_clauses WHERE clause_key = 'standard_parties'                AND company_id IS NULL AND is_default = true LIMIT 1),
    'appointment',                (SELECT id FROM ec_clauses WHERE clause_key = 'standard_appointment'            AND company_id IS NULL AND is_default = true LIMIT 1),
    'place_of_work',              (SELECT id FROM ec_clauses WHERE clause_key = 'standard_place_of_work'          AND company_id IS NULL AND is_default = true LIMIT 1),
    'duties',                     (SELECT id FROM ec_clauses WHERE clause_key = 'standard_duties'                 AND company_id IS NULL AND is_default = true LIMIT 1),
    'working_hours',              (SELECT id FROM ec_clauses WHERE clause_key = 'standard_office_hours'           AND company_id IS NULL AND is_default = true LIMIT 1),
    'remuneration',                (SELECT id FROM ec_clauses WHERE clause_key = 'standard_remuneration'           AND company_id IS NULL AND is_default = true LIMIT 1),
    'benefits',                   (SELECT id FROM ec_clauses WHERE clause_key = 'standard_benefits'               AND company_id IS NULL AND is_default = true LIMIT 1),
    'statutory_deductions',       (SELECT id FROM ec_clauses WHERE clause_key = 'standard_statutory_deductions'   AND company_id IS NULL AND is_default = true LIMIT 1),
    'leave',                      (SELECT id FROM ec_clauses WHERE clause_key = 'standard_leave'                  AND company_id IS NULL AND is_default = true LIMIT 1),
    'employee_obligations',       (SELECT id FROM ec_clauses WHERE clause_key = 'standard_employee_obligations'   AND company_id IS NULL AND is_default = true LIMIT 1),
    'performance',                (SELECT id FROM ec_clauses WHERE clause_key = 'standard_performance'            AND company_id IS NULL AND is_default = true LIMIT 1),
    'termination',                (SELECT id FROM ec_clauses WHERE clause_key = 'standard_termination'            AND company_id IS NULL AND is_default = true LIMIT 1),
    'general_provisions',         (SELECT id FROM ec_clauses WHERE clause_key = 'standard_general_provisions'     AND company_id IS NULL AND is_default = true LIMIT 1),
    'acceptance',                 (SELECT id FROM ec_clauses WHERE clause_key = 'standard_acceptance'             AND company_id IS NULL AND is_default = true LIMIT 1),
    'signatures',                 (SELECT id FROM ec_clauses WHERE clause_key = 'standard_signatures'             AND company_id IS NULL AND is_default = true LIMIT 1),
    'appendix_job_description',   (SELECT id FROM ec_clauses WHERE clause_key = 'standard_job_description'        AND company_id IS NULL AND is_default = true LIMIT 1),
    'appendix_salary_breakdown',  (SELECT id FROM ec_clauses WHERE clause_key = 'standard_salary_breakdown'       AND company_id IS NULL AND is_default = true LIMIT 1),
    'appendix_benefits_schedule', (SELECT id FROM ec_clauses WHERE clause_key = 'standard_benefits_schedule'      AND company_id IS NULL AND is_default = true LIMIT 1),
    'appendix_company_policies',  (SELECT id FROM ec_clauses WHERE clause_key = 'standard_company_policies'       AND company_id IS NULL AND is_default = true LIMIT 1),
    'appendix_equipment_issued',  (SELECT id FROM ec_clauses WHERE clause_key = 'standard_equipment_issued'       AND company_id IS NULL AND is_default = true LIMIT 1)
  ),
  true
);

-- ─── 9. POSITION — INTERN (Temporary, any dept) ───────────────────────────────
INSERT INTO ec_job_profiles (
  scope, company_id, name, department, job_title, employment_type, job_level, work_arrangement,
  settings, section_clauses, is_active
) VALUES (
  'position', '10', 'Intern - Temporary - Any Department', NULL, NULL, 'Temporary', 'Intern', 'Office',
  '{
    "notice_period": "1 week",
    "probation_period": "1 month",
    "probation_notice": "1 day",
    "working_days": "Monday to Friday",
    "working_hours": "40 hours",
    "start_time": "08:30 AM",
    "end_time": "05:00 PM",
    "break_duration": "1 hour",
    "rest_days": "Saturday and Sunday",
    "payment_frequency": "Monthly",
    "payment_day": "28th",
    "annual_leave_days": "14",
    "medical_cover": "NHIF only",
    "pension_scheme": "Not applicable for intern contracts",
    "reports_to": "Assigned Supervisor",
    "work_location": "Company HQ, Nairobi"
  }'::jsonb,
  jsonb_build_object(
    'heading',                    (SELECT id FROM ec_clauses WHERE clause_key = 'standard_heading'                AND company_id IS NULL AND is_default = true LIMIT 1),
    'parties',                    (SELECT id FROM ec_clauses WHERE clause_key = 'standard_parties'                AND company_id IS NULL AND is_default = true LIMIT 1),
    'appointment',                (SELECT id FROM ec_clauses WHERE clause_key = 'standard_appointment'            AND company_id IS NULL AND is_default = true LIMIT 1),
    'place_of_work',              (SELECT id FROM ec_clauses WHERE clause_key = 'standard_place_of_work'          AND company_id IS NULL AND is_default = true LIMIT 1),
    'duties',                     (SELECT id FROM ec_clauses WHERE clause_key = 'standard_duties'                 AND company_id IS NULL AND is_default = true LIMIT 1),
    'working_hours',              (SELECT id FROM ec_clauses WHERE clause_key = 'standard_office_hours'           AND company_id IS NULL AND is_default = true LIMIT 1),
    'remuneration',                (SELECT id FROM ec_clauses WHERE clause_key = 'standard_remuneration'           AND company_id IS NULL AND is_default = true LIMIT 1),
    'benefits',                   (SELECT id FROM ec_clauses WHERE clause_key = 'standard_benefits'               AND company_id IS NULL AND is_default = true LIMIT 1),
    'statutory_deductions',       (SELECT id FROM ec_clauses WHERE clause_key = 'standard_statutory_deductions'   AND company_id IS NULL AND is_default = true LIMIT 1),
    'leave',                      (SELECT id FROM ec_clauses WHERE clause_key = 'standard_leave'                  AND company_id IS NULL AND is_default = true LIMIT 1),
    'employee_obligations',       (SELECT id FROM ec_clauses WHERE clause_key = 'standard_employee_obligations'   AND company_id IS NULL AND is_default = true LIMIT 1),
    'performance',                (SELECT id FROM ec_clauses WHERE clause_key = 'standard_performance'            AND company_id IS NULL AND is_default = true LIMIT 1),
    'termination',                (SELECT id FROM ec_clauses WHERE clause_key = 'standard_termination'            AND company_id IS NULL AND is_default = true LIMIT 1),
    'general_provisions',         (SELECT id FROM ec_clauses WHERE clause_key = 'standard_general_provisions'     AND company_id IS NULL AND is_default = true LIMIT 1),
    'acceptance',                 (SELECT id FROM ec_clauses WHERE clause_key = 'standard_acceptance'             AND company_id IS NULL AND is_default = true LIMIT 1),
    'signatures',                 (SELECT id FROM ec_clauses WHERE clause_key = 'standard_signatures'             AND company_id IS NULL AND is_default = true LIMIT 1),
    'appendix_job_description',   (SELECT id FROM ec_clauses WHERE clause_key = 'standard_job_description'        AND company_id IS NULL AND is_default = true LIMIT 1),
    'appendix_salary_breakdown',  (SELECT id FROM ec_clauses WHERE clause_key = 'standard_salary_breakdown'       AND company_id IS NULL AND is_default = true LIMIT 1),
    'appendix_benefits_schedule', (SELECT id FROM ec_clauses WHERE clause_key = 'standard_benefits_schedule'      AND company_id IS NULL AND is_default = true LIMIT 1),
    'appendix_company_policies',  (SELECT id FROM ec_clauses WHERE clause_key = 'standard_company_policies'       AND company_id IS NULL AND is_default = true LIMIT 1),
    'appendix_equipment_issued',  (SELECT id FROM ec_clauses WHERE clause_key = 'standard_equipment_issued'       AND company_id IS NULL AND is_default = true LIMIT 1)
  ),
  true
);
