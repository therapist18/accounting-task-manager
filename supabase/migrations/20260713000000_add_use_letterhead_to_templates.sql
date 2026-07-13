ALTER TABLE public.acc_portal_templates
  ADD COLUMN IF NOT EXISTS use_letterhead boolean DEFAULT false;
