-- How (or whether) the client was told their stamped passport is ready — 'skipped' is a real,
-- explicit decision ("this client doesn't need notifying", e.g. because their dispatch method
-- itself already tells them, or they never require one) recorded the same way a real
-- notification is (with its own at/by), not just the absence of a value.
ALTER TABLE tm_passport_handling
  ADD COLUMN IF NOT EXISTS client_notified_method TEXT
    CHECK (client_notified_method IN ('call', 'text', 'auto_message', 'skipped'));
