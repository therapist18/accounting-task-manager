-- Create company letterheads table
CREATE TABLE public.acc_portal_company_letterheads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id bigint NOT NULL,
  
  -- Identification
  name text NOT NULL,
  description text,
  
  -- File storage
  file_path text NOT NULL,
  file_name text NOT NULL,
  file_size bigint,
  
  -- Optional: Contact details for quick reference/editing
  contact_details jsonb,
  
  -- Preview images (optional)
  header_preview_url text,
  footer_preview_url text,
  
  -- Flags
  is_default boolean DEFAULT false,
  is_active boolean DEFAULT true,
  
  -- Metadata
  metadata jsonb,
  
  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  -- Constraints
  CONSTRAINT acc_portal_company_letterheads_company_id_fkey 
    FOREIGN KEY (company_id) REFERENCES acc_portal_company_duplicate(id) ON DELETE CASCADE
);

-- Ensure only one default per company
CREATE UNIQUE INDEX idx_one_default_letterhead_per_company 
  ON acc_portal_company_letterheads (company_id) 
  WHERE is_default = true AND is_active = true;

-- Index for quick lookups
CREATE INDEX idx_letterheads_company_id 
  ON acc_portal_company_letterheads(company_id);

-- Index for active letterheads
CREATE INDEX idx_letterheads_active 
  ON acc_portal_company_letterheads(is_active) 
  WHERE is_active = true;

-- Trigger for updated_at
CREATE TRIGGER update_acc_portal_company_letterheads_modtime 
  BEFORE UPDATE ON acc_portal_company_letterheads 
  FOR EACH ROW 
  EXECUTE FUNCTION update_modified_column();

-- Add RLS policies
ALTER TABLE acc_portal_company_letterheads ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view letterheads for their companies
CREATE POLICY "Users can view company letterheads"
  ON acc_portal_company_letterheads
  FOR SELECT
  USING (true);

-- Policy: Users can insert letterheads
CREATE POLICY "Users can insert company letterheads"
  ON acc_portal_company_letterheads
  FOR INSERT
  WITH CHECK (true);

-- Policy: Users can update letterheads
CREATE POLICY "Users can update company letterheads"
  ON acc_portal_company_letterheads
  FOR UPDATE
  USING (true);

-- Policy: Users can delete letterheads
CREATE POLICY "Users can delete company letterheads"
  ON acc_portal_company_letterheads
  FOR DELETE
  USING (true);
