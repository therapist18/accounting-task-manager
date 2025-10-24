-- Drop the existing check constraint
ALTER TABLE public.tm_job_fields 
DROP CONSTRAINT IF EXISTS tm_job_fields_type_check;

-- Recreate the check constraint with the new type
ALTER TABLE public.tm_job_fields 
ADD CONSTRAINT tm_job_fields_type_check 
CHECK (type IN ('text', 'date', 'number', 'select', 'image'));
