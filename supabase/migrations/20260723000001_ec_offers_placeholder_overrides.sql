-- Per-contract placeholder overrides: lets a single Employment Offer override
-- any {{token}} value (employee/company identity, working hours, benefits,
-- leave days, etc.) for that one contract only, without touching the
-- underlying Employee/Company records or the Job Profile's settings cascade.
--
-- Applied as the final, most-specific layer in
-- utils/standardPlaceholders.ts:buildStandardPlaceholderValues - spread over
-- the computed identity/settings-cascade defaults, so an explicit override
-- always wins.
ALTER TABLE ec_employment_offers
  ADD COLUMN placeholder_overrides JSONB NOT NULL DEFAULT '{}'::jsonb;
