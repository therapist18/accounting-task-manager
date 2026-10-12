-- The dependant named on an EFNS printable page ("Dependant Name:"). On dependants' notices the page's
-- "Applicant Name" is the principal and the document belongs to the dependant, so auto-filing matches
-- the dependant (see parseApplicant in lib/immigrationNotifications.ts). Written by the EFNS
-- automation alongside printable_applicant / printable_company (20261015000000_efns_auto_filing.sql).
--
-- Idempotent.

ALTER TABLE immigration_notifications ADD COLUMN IF NOT EXISTS printable_dependant TEXT;
ALTER TABLE immigration_payments      ADD COLUMN IF NOT EXISTS printable_dependant TEXT;
