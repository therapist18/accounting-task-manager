ALTER TABLE acc_portal_templates
ADD COLUMN classification JSONB DEFAULT '{}'::jsonb;
