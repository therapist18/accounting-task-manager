-- Rate cards (Settings → Rates) and the Quotations module built on them.
--
-- Rates used to live in rates_history: one JSON blob per department per period, so changing one job
-- level meant re-saving every job level of the department as a new period. Rates now change per job
-- level instead: tm_rate_cards holds one row per (job level, effective date). A job level's rate on a
-- given day is its row with the latest effective_from on or before that day, and a row stays in force
-- until the next one for the same job level starts. There is no effective_to column; it would only be
-- a second copy of "the next row's effective_from" that could disagree with it. So a rate that never
-- changes is one row forever, and one that changes every year gets a row per year.
--
-- job_key identifies the job level the same way tm_tasks.job_level does:
-- "<department_id>/<subdepartment_id>/<class_id>/<subclass_id>", with the trailing parts left off for
-- a level that has none (classes/subclasses live in tm_subdepartments.classes JSON, so their ids are
-- text here).
--
-- card_type picks the column set: 'immigration' (the "Imm Rates" sheet: official fees, bond,
-- facilitation, extra charges, help, payment terms) or 'job' (the "Acc Rates" sheet: official fee,
-- consultancy fee, frequency, eTIMS gross-up). The values themselves are in `rates` (JSON) and are
-- described in app/(dashboard)/dashboard/departments/rates/rate-card/types.ts.
--
-- rates_history is left untouched; it is still what the draft-invoice step reads until it is moved
-- over.
--
-- Idempotent.

CREATE TABLE IF NOT EXISTS tm_rate_cards (
  id               BIGSERIAL PRIMARY KEY,
  job_key          TEXT NOT NULL,
  department_id    BIGINT NOT NULL,
  subdepartment_id BIGINT,
  class_id         TEXT,
  subclass_id      TEXT,
  -- Names at the time of saving, so history still reads sensibly after a job level is renamed.
  job_path         TEXT NOT NULL,
  card_type        TEXT NOT NULL CHECK (card_type IN ('immigration', 'job')),
  effective_from   DATE NOT NULL,
  rates            JSONB NOT NULL DEFAULT '{}'::jsonb,
  note             TEXT,
  created_by_name  TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by_name  TEXT,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (job_key, effective_from)
);

CREATE INDEX IF NOT EXISTS tm_rate_cards_department_idx ON tm_rate_cards (department_id, effective_from);

-- Values that apply to every rate card: the KES/USD bank rate, VAT, the corporation-tax rate used to
-- gross up consultancy fees for eTIMS invoices, and the round-up step. Effective-dated the same way
-- as tm_rate_cards, so a quotation dated last year still uses last year's exchange rate.
CREATE TABLE IF NOT EXISTS tm_rate_settings (
  id              BIGSERIAL PRIMARY KEY,
  effective_from  DATE NOT NULL UNIQUE,
  -- { usd_rate, vat_rate, corp_tax_rate, round_to }
  settings        JSONB NOT NULL,
  note            TEXT,
  created_by_name TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Values from the 02.10.2026 rate sheets: 135 KES/USD, 16% VAT, 30% corporation tax, round up to 1,000.
INSERT INTO tm_rate_settings (effective_from, settings, note)
VALUES ('2026-10-02', '{"usd_rate": 135, "vat_rate": 0.16, "corp_tax_rate": 0.30, "round_to": 1000}', 'From the 02.10.2026 rate sheets')
ON CONFLICT (effective_from) DO NOTHING;

-- ── Proposals → quotations → invoices ────────────────────────────────────────
--
-- One tm_quotations row follows a client's job from first proposal to invoice:
--
--   stage 'proposal'   Freely editable. Numbered PR-YYYY-####.
--   stage 'quotation'  "Mature to quotation" gives it a QT-YYYY-#### number and stamps quoted_at.
--                      From then on its lines change only through a revision: at most 3 (revision
--                      1..3), and none once 10 days have passed since quoted_at. Each revision keeps a
--                      copy of what it replaced in `revisions`.
--   stage 'invoice'    Once payments cover every line it is matured into a draft in the invoice
--                      generator (invoice_gen_invoice_drafts) — by the user, or automatically when
--                      auto_invoice is on.
--
-- Pricing is shown in two sections: without eTIMS, and with eTIMS (consultancy grossed up for
-- corporation tax, plus VAT). `sections` says which the client sees (both by default) and
-- `billing_basis` which one the client is actually paying against (chosen with the first payment).
--
-- Each line keeps a full copy of the rate it was priced from (items[].rates, items[].rate_card_id)
-- and the row keeps the settings it used, so later rate changes never alter a quotation.
--
-- Payments (tm_quotation_payments) carry their proof (an uploaded M-Pesa screenshot / bank slip in
-- the kyc-documents bucket, or a pasted M-Pesa message), the date and amount read from it, and how
-- the amount is split across the lines. Whatever is not allocated to a line — an overpayment — is
-- the client's credit balance.

CREATE SEQUENCE IF NOT EXISTS tm_proposal_number_seq;
CREATE SEQUENCE IF NOT EXISTS tm_quotation_number_seq;

CREATE TABLE IF NOT EXISTS tm_quotations (
  id                BIGSERIAL PRIMARY KEY,
  stage             TEXT NOT NULL DEFAULT 'proposal' CHECK (stage IN ('proposal', 'quotation', 'invoice')),
  -- Within a stage: still being prepared, sent to the client, turned down, or withdrawn.
  status            TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'rejected', 'cancelled')),
  proposal_number   TEXT NOT NULL UNIQUE
                    DEFAULT ('PR-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('tm_proposal_number_seq')::text, 4, '0')),
  quote_number      TEXT UNIQUE,
  quoted_at         TIMESTAMPTZ,
  revision          INT NOT NULL DEFAULT 0 CHECK (revision BETWEEN 0 AND 3),
  -- [{ revision, saved_at, saved_by_name, reason, items, totals, settings, sections, quote_date, valid_until, notes }]
  revisions         JSONB NOT NULL DEFAULT '[]'::jsonb,
  client_type       TEXT NOT NULL CHECK (client_type IN ('company', 'individual', 'other')),
  company_id        BIGINT,
  individual_id     BIGINT,
  -- Name at the time of quoting (and the only identity for 'other').
  client_name       TEXT NOT NULL,
  quote_date        DATE NOT NULL DEFAULT current_date,
  valid_until       DATE,
  -- Which pricing sections the client is shown: 'plain' (without eTIMS) and/or 'etims'.
  sections          TEXT[] NOT NULL DEFAULT ARRAY['plain', 'etims'],
  billing_basis     TEXT CHECK (billing_basis IN ('plain', 'etims')),
  auto_invoice      BOOLEAN NOT NULL DEFAULT false,
  settings          JSONB NOT NULL DEFAULT '{}'::jsonb,
  items             JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- { plain: { official, paid_at_bank, consultancy, vat, total }, etims: { … } }
  totals            JSONB NOT NULL DEFAULT '{}'::jsonb,
  notes             TEXT,
  invoice_draft_id  BIGINT,
  invoice_number    TEXT,
  invoiced_at       TIMESTAMPTZ,
  created_by_name   TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by_name   TEXT,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tm_quotations_company_idx ON tm_quotations (company_id);
CREATE INDEX IF NOT EXISTS tm_quotations_individual_idx ON tm_quotations (individual_id);
CREATE INDEX IF NOT EXISTS tm_quotations_date_idx ON tm_quotations (quote_date DESC);

-- Numbering on maturing, and the revision rules — enforced here as well as in the UI, so no other
-- path (a second window, a script) can slip past them.
CREATE OR REPLACE FUNCTION tm_quotations_lifecycle() RETURNS trigger AS $$
BEGIN
  IF NEW.stage IN ('quotation', 'invoice') AND NEW.quote_number IS NULL THEN
    NEW.quote_number := 'QT-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('tm_quotation_number_seq')::text, 4, '0');
    NEW.quoted_at := COALESCE(NEW.quoted_at, now());
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.stage = 'quotation' AND NEW.stage = 'quotation' THEN
      IF NEW.revision > OLD.revision AND now() > OLD.quoted_at + interval '10 days' THEN
        RAISE EXCEPTION 'Quotation % can no longer be revised: 10 days have passed since it was raised', OLD.quote_number;
      END IF;
      IF NEW.revision = OLD.revision AND NEW.items IS DISTINCT FROM OLD.items THEN
        RAISE EXCEPTION 'Quotation % lines can only change through a revision', OLD.quote_number;
      END IF;
    END IF;
    IF OLD.stage = 'invoice' AND (NEW.items IS DISTINCT FROM OLD.items OR NEW.stage <> 'invoice') THEN
      RAISE EXCEPTION 'Quotation % has been invoiced and can no longer change', OLD.quote_number;
    END IF;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tm_quotations_lifecycle ON tm_quotations;
CREATE TRIGGER tm_quotations_lifecycle
  BEFORE INSERT OR UPDATE ON tm_quotations
  FOR EACH ROW EXECUTE FUNCTION tm_quotations_lifecycle();

CREATE TABLE IF NOT EXISTS tm_quotation_payments (
  id               BIGSERIAL PRIMARY KEY,
  quotation_id     BIGINT NOT NULL REFERENCES tm_quotations(id) ON DELETE CASCADE,
  paid_on          DATE NOT NULL,
  amount           NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
  method           TEXT NOT NULL DEFAULT 'mpesa' CHECK (method IN ('mpesa', 'bank', 'cash', 'cheque', 'other')),
  -- M-Pesa transaction code, bank slip / reference number.
  reference        TEXT,
  payer            TEXT,
  -- Proof: an uploaded file (kyc-documents bucket path) and/or the pasted M-Pesa message.
  proof_path       TEXT,
  proof_name       TEXT,
  proof_text       TEXT,
  -- What was read off the proof, kept for audit even after the user corrects it.
  extracted        JSONB,
  -- [{ item_id, amount }] — the rest of `amount` is the client's credit.
  allocations      JSONB NOT NULL DEFAULT '[]'::jsonb,
  notes            TEXT,
  created_by_name  TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tm_quotation_payments_quotation_idx ON tm_quotation_payments (quotation_id, paid_on);
-- The same M-Pesa code / bank reference can't be recorded twice.
CREATE UNIQUE INDEX IF NOT EXISTS tm_quotation_payments_reference_idx
  ON tm_quotation_payments (method, upper(reference)) WHERE reference IS NOT NULL AND reference <> '';
