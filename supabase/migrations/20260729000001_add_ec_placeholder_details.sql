-- Adds the small set of DTM-style fields the Clause Library's placeholder
-- editor (reusing Document Template Manager's PlaceholderFormDialog) can
-- actually persist for an EC placeholder: a fallback value shown when the
-- source resolves to nothing, an internal note, and a required flag.
-- Everything else PlaceholderFormDialog exposes (type, conditions, checklist
-- config, image config, AI prompt, etc.) has no EC equivalent and is not
-- persisted - see ecPlaceholderAdapter.ts.
ALTER TABLE ec_placeholders
  ADD COLUMN default_value TEXT,
  ADD COLUMN description TEXT,
  ADD COLUMN required BOOLEAN NOT NULL DEFAULT false;
