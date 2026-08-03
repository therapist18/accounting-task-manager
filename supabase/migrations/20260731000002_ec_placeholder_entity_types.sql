-- Backfills entity_type for the placeholders seeded by
-- 20260723000003_seed_ec_placeholders.sql, which predates the entity_type
-- column (added later by 20260730000001_add_ec_placeholder_details_2.sql)
-- and so left it at its '{}' default for all of them. Without this, the new
-- Company/Employee highlight-by-entity in ContractPreview.tsx (see
-- employeeValues in components/ContractPreview.tsx) would have nothing to
-- key off for almost every token. Company Identity fields get 'company';
-- everything else seeded by that migration (Employee Identity, Employment
-- Details, Salary & Payment, Dates, Working Hours, Benefits, Termination &
-- Probation, Leave) is a fact about this specific employee's employment, so
-- gets 'individual'.
UPDATE ec_placeholders SET entity_type = ARRAY['company']
WHERE key IN ('company_name', 'company_address', 'company_kra_pin', 'company_email', 'company_registration_number')
  AND (entity_type IS NULL OR entity_type = '{}');

UPDATE ec_placeholders SET entity_type = ARRAY['employee']
WHERE key IN (
  'employee_name', 'employee_first_name', 'employee_last_name', 'employee_id', 'national_id',
  'kra_pin', 'nssf_number', 'shif_number', 'nhif_number', 'bank_name', 'bank_branch', 'bank_account',
  'contact_email', 'contact_phone',
  'department', 'job_title', 'employment_type', 'employment_status', 'work_arrangement',
  'job_level', 'reports_to', 'work_location',
  'basic_salary', 'currency', 'payment_frequency', 'payment_day', 'allowances',
  'start_date', 'end_date',
  'working_days', 'working_hours', 'start_time', 'end_time', 'break_duration', 'rest_days', 'work_mode',
  'medical_cover', 'housing_allowance', 'transport_allowance', 'telephone_allowance', 'meal_allowance', 'pension_scheme',
  'notice_period', 'probation_period', 'probation_notice', 'termination_reason',
  'annual_leave_days', 'sick_leave_days', 'maternity_leave_days', 'paternity_leave_days', 'compassionate_leave_days'
) AND (entity_type IS NULL OR entity_type = '{}');
