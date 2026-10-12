-- The EFNS automation connects with the anon key, so with RLS on and no policies it can't see the
-- requests queued in efns_sync_requests (20261017000000). It needs to read pending requests and mark
-- them running / done; queueing stays with the task manager's service role (no anon INSERT/DELETE).
--
-- Idempotent.

DROP POLICY IF EXISTS efns_sync_requests_anon_select ON efns_sync_requests;
CREATE POLICY efns_sync_requests_anon_select ON efns_sync_requests
  FOR SELECT TO anon
  USING (true);

DROP POLICY IF EXISTS efns_sync_requests_anon_update ON efns_sync_requests;
CREATE POLICY efns_sync_requests_anon_update ON efns_sync_requests
  FOR UPDATE TO anon
  USING (true)
  WITH CHECK (status IN ('running', 'done', 'error'));
