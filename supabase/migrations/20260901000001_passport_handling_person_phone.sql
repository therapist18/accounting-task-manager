-- Adds a phone number alongside the existing person-name field on both ends of the chain of
-- custody, for 'client_self' and 'client_representative' methods — captured so staff (or the
-- dialog's own "save to client profile" prompt) has a number on hand without leaving the wizard.
ALTER TABLE tm_passport_handling
  ADD COLUMN IF NOT EXISTS received_person_phone TEXT,
  ADD COLUMN IF NOT EXISTS dispatch_person_phone TEXT;
