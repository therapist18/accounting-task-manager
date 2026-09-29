-- Every notify match currently gets flattened to the same "urgent" priority, whether it's a genuine
-- emergency (KRA Web Portal account Locked, real customs duty due) or pure FYI (a password reset
-- confirmation, a general Tax Amnesty awareness blast sent to every taxpayer). notify_priority lets
-- each notify rule say which it is.
--
-- 'urgent'        (default, matches today's behaviour for existing rules) — priority='urgent'.
-- 'informational' — priority='normal': still lands in Notifications (so someone sees it), but reads
--                   as "FYI, no action needed" rather than demanding immediate attention.
--
-- Only meaningful when is_notify is true; ignored otherwise. Idempotent.

do $$
begin
  if not exists (select 1 from information_schema.columns
                 where table_name = 'email_classification_rules' and column_name = 'notify_priority') then
    alter table email_classification_rules
      add column notify_priority text not null default 'urgent'
        check (notify_priority in ('urgent', 'informational'));
  end if;
end $$;
