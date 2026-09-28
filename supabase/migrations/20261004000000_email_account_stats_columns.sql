-- Replaces the email_account_stats VIEW (20261003000000) with real columns on email_accounts —
-- email_count / first_email_at — kept in sync by a trigger on `emails` rather than computed on every
-- read. Two places currently insert/delete emails rows (ingestMessage's upsert, and the Ignored tab's
-- bulk delete route); a trigger covers both — and anything added later — without relying on each call
-- site to remember to update a counter by hand.
--
-- first_email_at is still the earliest email THIS APP STORED for the mailbox, not the mailbox's true
-- oldest message in Gmail — most mail is deliberately never stored at all (see the view's original
-- comment, now superseded).
--
-- Idempotent: safe to re-run.

ALTER TABLE email_accounts
  ADD COLUMN IF NOT EXISTS email_count    INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS first_email_at TIMESTAMPTZ;

-- One-time backfill from whatever is already stored (a no-op count-wise for a row the trigger has
-- already been keeping current, so this stays safe to re-run after the trigger exists too).
UPDATE email_accounts ea
SET email_count = COALESCE(stats.cnt, 0),
    first_email_at = stats.min_at
FROM (
  SELECT account_id, COUNT(*) AS cnt, MIN(received_at) AS min_at
  FROM emails
  WHERE account_id IS NOT NULL
  GROUP BY account_id
) stats
WHERE ea.id = stats.account_id;

CREATE OR REPLACE FUNCTION email_accounts_track_email_stats() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.account_id IS NOT NULL THEN
      UPDATE email_accounts
      SET email_count = email_count + 1,
          first_email_at = LEAST(COALESCE(first_email_at, NEW.received_at), NEW.received_at)
      WHERE id = NEW.account_id;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.account_id IS NOT NULL THEN
      -- Recomputes rather than just decrementing first_email_at's owner away, since we can't cheaply
      -- tell whether the deleted row WAS the earliest without this — deletes are rare (manual bulk
      -- delete from the Ignored tab), so the extra scan (indexed, emails_account_received_idx) is fine.
      UPDATE email_accounts
      SET email_count = GREATEST(email_count - 1, 0),
          first_email_at = (SELECT MIN(received_at) FROM emails WHERE account_id = OLD.account_id)
      WHERE id = OLD.account_id;
    END IF;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS emails_account_stats_insert ON emails;
CREATE TRIGGER emails_account_stats_insert
  AFTER INSERT ON emails
  FOR EACH ROW EXECUTE FUNCTION email_accounts_track_email_stats();

DROP TRIGGER IF EXISTS emails_account_stats_delete ON emails;
CREATE TRIGGER emails_account_stats_delete
  AFTER DELETE ON emails
  FOR EACH ROW EXECUTE FUNCTION email_accounts_track_email_stats();

-- Superseded by the columns above.
DROP VIEW IF EXISTS email_account_stats;
