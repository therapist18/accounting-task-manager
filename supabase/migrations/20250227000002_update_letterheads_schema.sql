-- Update letterheads table to match new architecture
-- This migration updates the existing acc_portal_company_letterheads table

-- Add new columns for the improved letterhead system
ALTER TABLE acc_portal_company_letterheads 
ADD COLUMN IF NOT EXISTS docx_url TEXT,
ADD COLUMN IF NOT EXISTS preview_image_url TEXT,
ADD COLUMN IF NOT EXISTS page_settings JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS body_box JSONB DEFAULT '{"top": 180, "left": 70, "right": 70, "bottom": 120}',
ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- Update existing records to use file_path as docx_url
UPDATE acc_portal_company_letterheads 
SET docx_url = file_path 
WHERE docx_url IS NULL AND file_path IS NOT NULL;

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_company_letterheads_company_active 
ON acc_portal_company_letterheads(company_id, is_active);

-- Add comment for documentation
COMMENT ON TABLE acc_portal_company_letterheads IS 'Company letterheads with preview generation and content positioning';
COMMENT ON COLUMN acc_portal_company_letterheads.docx_url IS 'URL to the original .docx file in storage';
COMMENT ON COLUMN acc_portal_company_letterheads.preview_image_url IS 'URL to the generated PNG preview image';
COMMENT ON COLUMN acc_portal_company_letterheads.page_settings IS 'Page settings like size, margins in JSON format';
COMMENT ON COLUMN acc_portal_company_letterheads.body_box IS 'Content area positioning: {top, left, right, bottom} in pixels';
COMMENT ON COLUMN acc_portal_company_letterheads.version IS 'Version number for letterhead updates';
COMMENT ON COLUMN acc_portal_company_letterheads.is_active IS 'Whether this letterhead is currently active';
