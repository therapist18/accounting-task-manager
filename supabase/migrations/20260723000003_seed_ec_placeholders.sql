-- Seeds ec_placeholders with every token utils/standardPlaceholders.ts
-- already computes, categorized by where it actually comes from today.
-- master_field_id is left NULL for every 'master_field' row - link each one
-- to a tm_job_fields row via the Data Sources admin page
-- (/dashboard/employment-contracts/placeholders). Until linked, resolution
-- falls back to the existing hardcoded computation, so nothing breaks.
INSERT INTO ec_placeholders (key, label, group_label, source_kind, settings_key, offer_field, editable) VALUES
  -- Employee Identity (master_field - links to Employee/Individual records)
  ('employee_name', 'Full Name', 'Employee Identity', 'master_field', NULL, NULL, true),
  ('employee_first_name', 'First Name', 'Employee Identity', 'master_field', NULL, NULL, true),
  ('employee_last_name', 'Last Name', 'Employee Identity', 'master_field', NULL, NULL, true),
  ('employee_id', 'Employee ID', 'Employee Identity', 'master_field', NULL, NULL, true),
  ('national_id', 'National ID', 'Employee Identity', 'master_field', NULL, NULL, true),
  ('kra_pin', 'KRA PIN', 'Employee Identity', 'master_field', NULL, NULL, true),
  ('nssf_number', 'NSSF Number', 'Employee Identity', 'master_field', NULL, NULL, true),
  ('shif_number', 'SHIF Number', 'Employee Identity', 'master_field', NULL, NULL, true),
  ('nhif_number', 'NHIF Number', 'Employee Identity', 'master_field', NULL, NULL, true),
  ('bank_name', 'Bank Name', 'Employee Identity', 'master_field', NULL, NULL, true),
  ('bank_branch', 'Bank Branch', 'Employee Identity', 'master_field', NULL, NULL, true),
  ('bank_account', 'Bank Account', 'Employee Identity', 'master_field', NULL, NULL, true),
  ('contact_email', 'Contact Email', 'Employee Identity', 'master_field', NULL, NULL, true),
  ('contact_phone', 'Contact Phone', 'Employee Identity', 'master_field', NULL, NULL, true),

  -- Company Identity (master_field - links to Company records)
  ('company_name', 'Company Name', 'Company Identity', 'master_field', NULL, NULL, true),
  ('company_address', 'Company Address', 'Company Identity', 'master_field', NULL, NULL, true),
  ('company_kra_pin', 'Company KRA PIN', 'Company Identity', 'master_field', NULL, NULL, true),
  ('company_email', 'Company Email', 'Company Identity', 'master_field', NULL, NULL, true),
  ('company_registration_number', 'Registration Number', 'Company Identity', 'master_field', NULL, NULL, true),

  -- Employment Details - part master_field (employee record), part settings cascade
  ('department', 'Department', 'Employment Details', 'master_field', NULL, NULL, true),
  ('job_title', 'Job Title', 'Employment Details', 'master_field', NULL, NULL, true),
  ('employment_type', 'Employment Type', 'Employment Details', 'master_field', NULL, NULL, true),
  ('employment_status', 'Employment Status', 'Employment Details', 'master_field', NULL, NULL, true),
  ('work_arrangement', 'Work Arrangement', 'Employment Details', 'master_field', NULL, NULL, true),
  ('job_level', 'Job Level', 'Employment Details', 'settings_cascade', 'job_level', NULL, true),
  ('reports_to', 'Reports To', 'Employment Details', 'settings_cascade', 'reports_to', NULL, true),
  ('work_location', 'Work Location', 'Employment Details', 'settings_cascade', 'work_location', NULL, true),

  -- Salary & Payment
  ('basic_salary', 'Basic Salary', 'Salary & Payment', 'offer', NULL, 'basic_salary', false),
  ('currency', 'Currency', 'Salary & Payment', 'offer', NULL, 'currency', false),
  ('payment_frequency', 'Payment Frequency', 'Salary & Payment', 'settings_cascade', 'payment_frequency', NULL, true),
  ('payment_day', 'Payment Day', 'Salary & Payment', 'settings_cascade', 'payment_day', NULL, true),
  ('allowances', 'Allowances', 'Salary & Payment', 'offer', NULL, 'allowances', true),

  -- Dates
  ('start_date', 'Start Date', 'Dates', 'offer', NULL, 'start_date', false),
  ('end_date', 'End Date', 'Dates', 'offer', NULL, 'end_date', false),

  -- Working Hours (settings cascade)
  ('working_days', 'Working Days', 'Working Hours', 'settings_cascade', 'working_days', NULL, true),
  ('working_hours', 'Working Hours', 'Working Hours', 'settings_cascade', 'working_hours', NULL, true),
  ('start_time', 'Start Time', 'Working Hours', 'settings_cascade', 'start_time', NULL, true),
  ('end_time', 'End Time', 'Working Hours', 'settings_cascade', 'end_time', NULL, true),
  ('break_duration', 'Break Duration', 'Working Hours', 'settings_cascade', 'break_duration', NULL, true),
  ('rest_days', 'Rest Days', 'Working Hours', 'settings_cascade', 'rest_days', NULL, true),
  ('work_mode', 'Work Mode', 'Working Hours', 'settings_cascade', 'work_mode', NULL, true),

  -- Benefits (settings cascade)
  ('medical_cover', 'Medical Cover', 'Benefits', 'settings_cascade', 'medical_cover', NULL, true),
  ('housing_allowance', 'Housing Allowance', 'Benefits', 'settings_cascade', 'housing_allowance', NULL, true),
  ('transport_allowance', 'Transport Allowance', 'Benefits', 'settings_cascade', 'transport_allowance', NULL, true),
  ('telephone_allowance', 'Telephone Allowance', 'Benefits', 'settings_cascade', 'telephone_allowance', NULL, true),
  ('meal_allowance', 'Meal Allowance', 'Benefits', 'settings_cascade', 'meal_allowance', NULL, true),
  ('pension_scheme', 'Pension Scheme', 'Benefits', 'settings_cascade', 'pension_scheme', NULL, true),

  -- Termination & Probation (settings cascade)
  ('notice_period', 'Notice Period', 'Termination & Probation', 'settings_cascade', 'notice_period', NULL, true),
  ('probation_period', 'Probation Period', 'Termination & Probation', 'settings_cascade', 'probation_period', NULL, true),
  ('probation_notice', 'Probation Notice', 'Termination & Probation', 'settings_cascade', 'probation_notice', NULL, true),
  ('termination_reason', 'Termination Reason', 'Termination & Probation', 'settings_cascade', 'termination_reason', NULL, true),

  -- Leave (settings cascade)
  ('annual_leave_days', 'Annual Leave Days', 'Leave', 'settings_cascade', 'annual_leave_days', NULL, true),
  ('sick_leave_days', 'Sick Leave Days', 'Leave', 'settings_cascade', 'sick_leave_days', NULL, true),
  ('maternity_leave_days', 'Maternity Leave Days', 'Leave', 'settings_cascade', 'maternity_leave_days', NULL, true),
  ('paternity_leave_days', 'Paternity Leave Days', 'Leave', 'settings_cascade', 'paternity_leave_days', NULL, true),
  ('compassionate_leave_days', 'Compassionate Leave Days', 'Leave', 'settings_cascade', 'compassionate_leave_days', NULL, true);
