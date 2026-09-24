-- Rules get two extensions:
--   1. is_notify — a rule that flags matched email as an IMPORTANT NOTIFICATION. It never creates a
--      KRA task/case; matched email is stored and flagged urgent so staff act on it, without opening
--      a case. Mirrors how is_ignore marks ignore rules.
--   2. sender_pattern / sender_match_type — let an ignore (or notify) rule match on the SENDER
--      address instead of (or in addition to) the subject, e.g. "ignore everything from
--      contact@x.com". Auto-ignoring no-reply@/alerts@ stays in code, this is for additional senders.

do $$
begin
  if not exists (select 1 from information_schema.columns
                 where table_name = 'email_classification_rules' and column_name = 'is_notify') then
    alter table email_classification_rules add column is_notify boolean not null default false;
  end if;
  if not exists (select 1 from information_schema.columns
                 where table_name = 'email_classification_rules' and column_name = 'sender_pattern') then
    alter table email_classification_rules add column sender_pattern text;
  end if;
  if not exists (select 1 from information_schema.columns
                 where table_name = 'email_classification_rules' and column_name = 'sender_match_type') then
    alter table email_classification_rules add column sender_match_type text check (sender_match_type in ('contains', 'regex'));
  end if;
end $$;