-- Fix for document_workflow_logs table
-- Change uploaded_doc_id from bigint to text to support UUIDs

-- First drop the foreign key constraint if it exists
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'document_workflow_logs_uploaded_doc_id_fkey'
        AND table_name = 'document_workflow_logs'
    ) THEN
        ALTER TABLE public.document_workflow_logs 
        DROP CONSTRAINT document_workflow_logs_uploaded_doc_id_fkey;
    END IF;
END $$;

-- Change the column type from bigint to text
ALTER TABLE public.document_workflow_logs 
ALTER COLUMN uploaded_doc_id TYPE text USING uploaded_doc_id::text;

-- Note: If you need to add a foreign key constraint back, 
-- you'll need to reference the correct table and column that stores UUIDs
-- For example:
-- ALTER TABLE public.document_workflow_logs 
-- ADD CONSTRAINT document_workflow_logs_uploaded_doc_id_fkey 
-- FOREIGN KEY (uploaded_doc_id) REFERENCES uploaded_documents(id) 
-- ON DELETE CASCADE;
