-- Adds `is_ignore` to email_classification_rules so a rule can mean "ignore this email" instead of
-- "classify it into a category". Same table as the classification rules — the only difference is a flag.
--
--   is_ignore = FALSE (default) today's behaviour: pick a category; what happens next (open a case,
--                        update one, or skip) comes from the category.
--   is_ignore = TRUE     matching emails are never stored and never open a case; they stay in Gmail.
--                        The category_key column must stay set (NOT NULL in the base migration), so
--                        ignore rules store 'system_noise' there and it is ignored.
--
-- Ignore rules are checked before classification for EVERY sender (not just KRA), since the point
-- is to keep noise like newsletters and automated mail out of the app.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'email_classification_rules'
  ) THEN
    ALTER TABLE email_classification_rules
      ADD COLUMN IF NOT EXISTS is_ignore BOOLEAN NOT NULL DEFAULT FALSE;
  END IF;
END $$;