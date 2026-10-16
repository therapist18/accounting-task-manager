-- Extend tm_quotations to support proposals, revision tracking, eTIMS mode, and payment tracking.
-- Safe to apply multiple times (all clauses use IF NOT EXISTS / DROP IF EXISTS).

-- ── new columns ───────────────────────────────────────────────────────────────

ALTER TABLE tm_quotations
  ADD COLUMN IF NOT EXISTS revision_number   integer      NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS revised_at        timestamptz,
  ADD COLUMN IF NOT EXISTS proposal_date     date,
  ADD COLUMN IF NOT EXISTS etims_mode        text         NOT NULL DEFAULT 'without',
  ADD COLUMN IF NOT EXISTS payments          jsonb        NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS payment_status    text         NOT NULL DEFAULT 'unpaid';

-- ── constraints ──────────────────────────────────────────────────────────────

-- etims_mode: which pricing section(s) appear on the document
ALTER TABLE tm_quotations
  DROP CONSTRAINT IF EXISTS tm_quotations_etims_mode_check;
ALTER TABLE tm_quotations
  ADD  CONSTRAINT tm_quotations_etims_mode_check
  CHECK (etims_mode IN ('without', 'with', 'both'));

-- payment_status
ALTER TABLE tm_quotations
  DROP CONSTRAINT IF EXISTS tm_quotations_payment_status_check;
ALTER TABLE tm_quotations
  ADD  CONSTRAINT tm_quotations_payment_status_check
  CHECK (payment_status IN ('unpaid', 'partial', 'paid', 'overpaid'));

-- status: extend to include 'proposal' and 'invoice'
ALTER TABLE tm_quotations
  DROP CONSTRAINT IF EXISTS tm_quotations_status_check;
ALTER TABLE tm_quotations
  ADD  CONSTRAINT tm_quotations_status_check
  CHECK (status IN ('proposal', 'draft', 'sent', 'accepted', 'rejected', 'expired', 'invoice'));

-- ── back-fill ─────────────────────────────────────────────────────────────────
-- Old rows: if with_etims was true set etims_mode = 'with', otherwise 'without'.

UPDATE tm_quotations
SET    etims_mode = CASE WHEN with_etims THEN 'with' ELSE 'without' END
WHERE  etims_mode = 'without';   -- only rows that haven't been touched yet

-- ── indexes ───────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS tm_quotations_payment_status_idx ON tm_quotations (payment_status);
CREATE INDEX IF NOT EXISTS tm_quotations_status_idx         ON tm_quotations (status);
