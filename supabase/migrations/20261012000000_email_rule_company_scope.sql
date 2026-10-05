-- Rules apply to every company by default. company_scope lets a rule be narrowed:
--
--   'all'    (default — today's behaviour) the rule applies to mail of every company.
--   'only'   the rule applies ONLY to mail of the companies in company_ids.
--   'except' the rule applies to every company EXCEPT the ones in company_ids
--            (e.g. ignore accounts@ mail for everyone but company 10).
--
-- company_ids holds company ids as text (the id type differs between the tables that reference a
-- company, so they are compared as strings). Mail with no company only matches 'all' and 'except'
-- rules. Idempotent.

do $$
begin
  if not exists (select 1 from information_schema.columns
                 where table_name = 'email_classification_rules' and column_name = 'company_scope') then
    alter table email_classification_rules
      add column company_scope text not null default 'all'
        check (company_scope in ('all', 'only', 'except'));
  end if;
  if not exists (select 1 from information_schema.columns
                 where table_name = 'email_classification_rules' and column_name = 'company_ids') then
    alter table email_classification_rules
      add column company_ids text[] not null default '{}';
  end if;
end $$;

-- Two live rules may now share wording as long as they differ in scope (e.g. "ignore accounts@ except
-- company 10" next to "classify accounts@ for company 10"), so the scope is part of the uniqueness key.
drop index if exists email_classification_rules_match_pattern_sender_uidx;

create unique index if not exists email_classification_rules_match_pattern_sender_uidx
  on email_classification_rules (match_type, pattern, coalesce(sender_pattern, ''), company_scope, company_ids)
  where deleted_at is null;
