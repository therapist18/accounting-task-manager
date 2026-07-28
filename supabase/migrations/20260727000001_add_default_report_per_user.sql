-- Per-user default report: lets each user mark one of their saved reports (Reports
-- module, MemorizedReportDialog) as "default" so the Reports page auto-loads it for
-- them on open, without affecting what any other user sees as their own default.
-- At most one report should have a given user's id here at any time — enforced at the
-- application layer (clear any existing match for that user before setting a new one)
-- rather than a DB constraint, consistent with how this table already treats
-- is_favorite/job_level etc.
ALTER TABLE tm_memorized_reports
  ADD COLUMN default_for_user_id TEXT;
