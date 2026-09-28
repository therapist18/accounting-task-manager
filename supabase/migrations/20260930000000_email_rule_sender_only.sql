-- Fixes a real bug: a sender-only ignore/notify rule (no subject wording, just "ignore everything
-- from X") is exactly what the Rules dialog already invites ("Subject wordings ... optional if you
-- set a sender"), and the server-side validation already allows it — but the table's ORIGINAL
-- constraints, from before sender_pattern existed, never caught up:
--
--   1. pattern's CHECK required a non-empty subject always, so saving with pattern='' (no subject,
--      sender only) was rejected outright: "violates check constraint
--      email_classification_rules_pattern_check".
--   2. UNIQUE (match_type, pattern) means every sender-only rule shares the same empty pattern, so
--      even with (1) fixed, only ONE sender-only rule could ever be saved — the second one would hit
--      "A rule with this exact pattern already exists."
--
-- Fix:
--   1. Replace the pattern CHECK with one that only blocks a rule matching NOTHING at all (empty
--      subject AND empty sender) — the same rule the client and parseRuleBody already enforce.
--   2. Replace the UNIQUE constraint with one that folds sender_pattern in (via COALESCE, so two
--      ordinary subject-only rules — both NULL sender — still collide exactly as before; NULL <>
--      NULL would otherwise let unlimited duplicates through).
--
-- Constraint names are looked up rather than hardcoded, since either could have been created from an
-- earlier or later revision of this file's CREATE TABLE with a different auto-generated name.
-- Idempotent.

do $$
declare
  chk_name text;
  uniq_name text;
begin
  select con.conname into chk_name
  from pg_constraint con
  where con.conrelid = 'email_classification_rules'::regclass
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) ilike '%btrim(pattern)%';
  if chk_name is not null then
    execute format('alter table email_classification_rules drop constraint %I', chk_name);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'email_classification_rules'::regclass
      and conname = 'email_classification_rules_pattern_or_sender_chk'
  ) then
    alter table email_classification_rules
      add constraint email_classification_rules_pattern_or_sender_chk
      check (
        length(pattern) <= 300
        and (length(btrim(pattern)) > 0 or (sender_pattern is not null and length(btrim(sender_pattern)) > 0))
      );
  end if;

  select con.conname into uniq_name
  from pg_constraint con
  where con.conrelid = 'email_classification_rules'::regclass
    and con.contype = 'u'
    and array_length(con.conkey, 1) = 2
    and (
      select array_agg(a.attname::text) from pg_attribute a
      where a.attrelid = con.conrelid and a.attnum = any(con.conkey)
    ) @> array['match_type', 'pattern'];
  if uniq_name is not null then
    execute format('alter table email_classification_rules drop constraint %I', uniq_name);
  end if;
end $$;

create unique index if not exists email_classification_rules_match_pattern_sender_uidx
  on email_classification_rules (match_type, pattern, coalesce(sender_pattern, ''));
