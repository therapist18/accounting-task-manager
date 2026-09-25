-- Emails stored because an ignore rule matched them remember WHICH rule, so the Ignored tab can list
-- the rules in a sidebar and show what each one caught (and let staff re-allocate or delete those mails).
--
-- Before this, mail matching a confident ignore rule was dropped at ingestion and never stored, so there
-- was nothing to show. Now it is stored (headers only — no body, no attachments) with disposition
-- 'ignore' and this column pointing at the rule. Deleting a rule leaves its mails in place, ungrouped.
--
-- Idempotent. The app keeps working without it (mail is stored untagged and shows under "Other").

do $$
begin
  if not exists (select 1 from information_schema.columns
                 where table_name = 'emails' and column_name = 'matched_rule_id') then
    alter table emails
      add column matched_rule_id uuid references email_classification_rules(id) on delete set null;
    create index emails_matched_rule_idx on emails (matched_rule_id);
  end if;
end $$;
