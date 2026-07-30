-- Add entity_type and multi-master-field support to ec_placeholders
ALTER TABLE ec_placeholders ADD COLUMN entity_type TEXT[] DEFAULT '{}'::TEXT[];
ALTER TABLE ec_placeholders ADD COLUMN master_field_links JSONB DEFAULT '[]'::JSONB;
