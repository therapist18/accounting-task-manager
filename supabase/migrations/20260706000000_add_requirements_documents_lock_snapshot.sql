ALTER TABLE public.tm_tasks
  ADD COLUMN IF NOT EXISTS processing_requirements_documents jsonb,
  ADD COLUMN IF NOT EXISTS issuance_requirements_documents jsonb;
