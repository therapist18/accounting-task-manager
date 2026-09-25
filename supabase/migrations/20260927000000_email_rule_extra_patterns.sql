-- A rule can carry several subject wordings instead of just one.
--
-- Before: one rule = one pattern. Two differently-worded subjects that mean the same kind of notice
-- needed two rules pointing at the same category, e.g.
--   "Appointment Letter for Withholding VAT Agent Registration ..."
--   "NOTICE OF INTENTION TO APPOINT AS A VALUE ADDED TAX WITHHOLDING (WHVAT) AGENT"
--
-- Now: `pattern` stays the rule's primary wording and `extra_patterns` holds any number of alternative
-- wordings, all using the rule's own match_type. A rule matches when the subject matches ANY of them
-- (OR). Order, confidence, category, ignore/notify and the optional sender filter still belong to the
-- rule as a whole — the wordings only widen what counts as "this kind of subject".
--
-- Nothing changes for existing rules (the default is an empty list). If this migration is not applied
-- yet, the app keeps working exactly as before; only saving a rule with extra wordings is refused, with a
-- message saying so.
--
-- Idempotent.

do $$
begin
  if not exists (select 1 from information_schema.columns
                 where table_name = 'email_classification_rules' and column_name = 'extra_patterns') then
    alter table email_classification_rules add column extra_patterns text[] not null default '{}';
  end if;
end $$;
