ALTER TABLE tm_job_fields
ADD COLUMN field_scope TEXT NOT NULL DEFAULT 'general'
CHECK (field_scope IN ('general', 'immigration'));
