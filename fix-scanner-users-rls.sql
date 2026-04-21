-- Fix infinite recursion in RLS policies for scanner_users
-- Run this in Supabase SQL Editor

-- Step 1: Disable RLS on scanner_users to break circular reference
ALTER TABLE public.scanner_users DISABLE ROW LEVEL SECURITY;

-- Step 2: If you need RLS, recreate policies without circular reference
-- Uncomment below if you need to re-enable RLS with non-circular policies

/*
-- Re-enable RLS
ALTER TABLE public.scanner_users ENABLE ROW LEVEL SECURITY;

-- Create simple policy that doesn't reference acc_portal_company_duplicate
DROP POLICY IF EXISTS "Users can view scanner_users" ON public.scanner_users;
DROP POLICY IF EXISTS "Users can insert scanner_users" ON public.scanner_users;
DROP POLICY IF EXISTS "Users can update scanner_users" ON public.scanner_users;
DROP POLICY IF EXISTS "Users can delete scanner_users" ON public.scanner_users;

-- Policy: Allow authenticated users to view all scanner_users
CREATE POLICY "Users can view scanner_users"
  ON public.scanner_users
  FOR SELECT
  TO authenticated
  USING (true);

-- Policy: Allow service role to modify scanner_users
CREATE POLICY "Service role can modify scanner_users"
  ON public.scanner_users
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
*/

-- Verification query
SELECT 
  tablename,
  rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('scanner_users', 'acc_portal_company_duplicate');
