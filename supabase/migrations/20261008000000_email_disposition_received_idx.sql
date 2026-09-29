-- emails_disposition_idx (20260921000000) is disposition-only: it finds matching rows fast, but
-- Postgres still has to sort every one of them separately to satisfy `ORDER BY received_at DESC` on
-- the emails list route. That sort was cheap while each disposition bucket was a few hundred/thousand
-- rows; it stops being cheap once one bucket holds a large share of the whole mailbox (e.g. right after
-- "Reset to Needs Review" moves everything back into needs_review) — exactly when a plain query GET
-- started hitting Postgres's statement_timeout instead of just being a little slow.
--
-- A composite (disposition, received_at DESC) index lets Postgres read matching rows already in the
-- right order — no separate sort step, regardless of how large that disposition's bucket gets.
--
-- The old single-column index is dropped (superseded — this one still serves plain
-- `WHERE disposition = ...` lookups on its own, so nothing is lost).

DROP INDEX IF EXISTS emails_disposition_idx;
CREATE INDEX IF NOT EXISTS emails_disposition_received_idx ON emails (disposition, received_at DESC);
