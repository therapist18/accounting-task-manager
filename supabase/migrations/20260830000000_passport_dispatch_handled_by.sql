-- Who from BCL handled the dispatch back to the client. `delivered_by` only captures the
-- single staff-delivery scenario (staff carrying it over); this records the BCL dispatcher
-- for delivery AND pickup alike, so the chain of custody has a named BCL point of contact
-- regardless of dispatch method.
ALTER TABLE tm_passport_handling
  ADD COLUMN IF NOT EXISTS dispatch_handled_by UUID REFERENCES scanner_users(id);