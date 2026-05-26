CREATE TABLE IF NOT EXISTS public.tm_role_permissions (
  role TEXT PRIMARY KEY,
  permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.tm_role_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role can manage role permissions"
  ON public.tm_role_permissions;

CREATE POLICY "Service role can manage role permissions"
  ON public.tm_role_permissions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
