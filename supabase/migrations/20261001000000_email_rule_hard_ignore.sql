-- A second tier of ignore rule: "Ignore and delete" — matching mail is dropped entirely at
-- ingestion, the same way certificates/statements/system noise already are, instead of being stored
-- under the Ignored tab. For mail that has nothing to do with KRA at all (a login verification code
-- from an unrelated service, say) there is no reason to keep a record of it anywhere in the app.
--
-- hard_ignore only means anything on a row where is_ignore is also true; it's ignored otherwise.
-- Idempotent.

do $$
begin
  if not exists (select 1 from information_schema.columns
                 where table_name = 'email_classification_rules' and column_name = 'hard_ignore') then
    alter table email_classification_rules add column hard_ignore boolean not null default false;
  end if;
end $$;
