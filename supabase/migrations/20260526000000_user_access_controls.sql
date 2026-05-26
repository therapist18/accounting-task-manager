CREATE TABLE IF NOT EXISTS public.tm_user_access_controls (
  user_id UUID PRIMARY KEY REFERENCES public.scanner_users(id) ON DELETE CASCADE,
  permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tm_user_access_controls_permissions
  ON public.tm_user_access_controls USING GIN (permissions);

ALTER TABLE public.tm_user_access_controls ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role can manage task manager access controls"
  ON public.tm_user_access_controls;

CREATE POLICY "Service role can manage task manager access controls"
  ON public.tm_user_access_controls
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
