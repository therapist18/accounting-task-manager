-- Create letterheads storage bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'letterheads',
  'letterheads',
  false, -- Set to true if you want public access, false for authenticated only
  52428800, -- 50MB file size limit
  ARRAY[
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', -- .docx
    'application/msword' -- .doc
  ]
)
ON CONFLICT (id) DO NOTHING;

-- Enable RLS on storage.objects
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Policy: Allow authenticated users to upload files to letterheads bucket
CREATE POLICY "Allow authenticated users to upload letterheads"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'letterheads'
);

-- Policy: Allow authenticated users to read files from letterheads bucket
CREATE POLICY "Allow authenticated users to read letterheads"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'letterheads'
);

-- Policy: Allow authenticated users to update files in letterheads bucket
CREATE POLICY "Allow authenticated users to update letterheads"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'letterheads'
)
WITH CHECK (
  bucket_id = 'letterheads'
);

-- Policy: Allow authenticated users to delete files from letterheads bucket
CREATE POLICY "Allow authenticated users to delete letterheads"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'letterheads'
);

-- Optional: If you want to allow public read access (uncomment if needed)
-- CREATE POLICY "Allow public read access to letterheads"
-- ON storage.objects
-- FOR SELECT
-- TO public
-- USING (
--   bucket_id = 'letterheads'
-- );

-- Optional: Grant all rights to service role (for admin operations)
CREATE POLICY "Allow service role full access to letterheads"
ON storage.objects
FOR ALL
TO service_role
USING (
  bucket_id = 'letterheads'
)
WITH CHECK (
  bucket_id = 'letterheads'
);
