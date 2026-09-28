-- A rule can already carry several subject wordings (extra_patterns, 20260927000000) but only ever one
-- sender — so "ignore mail from marketing.emails@cloudhq.net OR notifications@link.com" needed either
-- two separate rules or a hand-written regex alternation crammed into one field (exactly the kind of
-- unreadable pattern extra_patterns was built to avoid, just on the sender side instead of the subject).
--
-- extra_sender_patterns mirrors extra_patterns exactly: sender_pattern stays the rule's primary sender,
-- extra_sender_patterns holds any number of alternatives (same sender_match_type as the rule), and the
-- rule matches a sender that matches ANY of them.
--
-- Idempotent. Nothing changes for existing rules (default '{}'); if this isn't applied yet, saving a
-- rule with extra senders is refused with a message saying so, same as extra_patterns.

do $$
begin
  if not exists (select 1 from information_schema.columns
                 where table_name = 'email_classification_rules' and column_name = 'extra_sender_patterns') then
    alter table email_classification_rules add column extra_sender_patterns text[] not null default '{}';
  end if;
end $$;
