-- Add Consultancy Contract as a document type in acc_portal_kyc
-- This allows it to use acc_portal_templates with isolated placeholders

INSERT INTO public.acc_portal_kyc (
  id,
  name,
  display_name,
  main_category,
  has_template,
  created_at,
  updated_at
) VALUES (
  'dcdd687b-5fd3-4bf5-a4c5-3156a562399d',
  'consultancy_contract',
  'Consultancy Contract',
  'Contracts',
  true,
  now(),
  now()
) ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  display_name = EXCLUDED.display_name,
  main_category = EXCLUDED.main_category,
  has_template = EXCLUDED.has_template,
  updated_at = now();