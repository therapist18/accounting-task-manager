-- Rule updates/additions to clear the Needs Review backlog (10k+ mails, mostly a one-time bulk
-- "reset for reclassification"), paired with the new non-KRA catch-all added in ingest.ts/
-- reclassify/route.ts (anything not from KRA, not part of an already-tracked case thread, and not
-- otherwise matched is now soft-ignored in code — there's no rule type for "anything that isn't KRA").
-- The rules below cover the gaps that catch-all can't: genuine KRA-domain mail (so isKraSender() is
-- true, the catch-all never applies) that the existing rules don't yet recognize.
--
-- 1. KRA iTax OTP emails ("Generated OTP for Email Verification", 482 occurrences) from
--    admin.itax2@kra.go.ke / kradev@kra.go.ke weren't caught by the existing OTP/password rule — it
--    only listed admin.itax@kra.go.ke (no "2") and didn't have a wording for "otp" itself.
-- 2. KRA Customs (iCMS) notices (Scanner Outcome, Amendment of a declaration, Charge Sheet, Offense
--    Report, Request for Settlement, Settlement Approved) are a business line this tool doesn't model
--    as its own category — flagged (Notifications tab, no case), same treatment as the existing
--    "Registered Customs Entry" rule already gives the highest-volume one of this family.
-- 3. "KRA Web Portal account Locked/unlocked" (77 occurrences) is worded differently from "password
--    reset for KRA web portal", which the existing notify rule already covers — same rule, added
--    wordings.
-- 4. Three new classify rules for KRA demand/reminder notices with no existing coverage: unpaid PRNs,
--    generic tax reminders, and pending PAYE payment — all genuine casework, not noise.

-- Appended (not replaced) and deduped, so this is safe to run even if someone already added an
-- overlapping wording by hand from the Rules tab in the meantime.
update email_classification_rules
set extra_patterns = (select array(select distinct unnest(extra_patterns || array['generated otp']))),
    extra_sender_patterns = (select array(select distinct unnest(extra_sender_patterns || array['admin.itax2@kra.go.ke', 'kradev@kra.go.ke']))),
    updated_at = now()
where id = '375070c3-5d36-4b40-8038-339f08bd2af3';

update email_classification_rules
set extra_patterns = (select array(select distinct unnest(extra_patterns || array['scanner outcome', 'amendment of a declaration', 'charge sheet', 'offense report', 'request for settlement', 'settlement approved with eslip']))),
    updated_at = now()
where id = '934042bb-5473-4feb-8846-8c3f00649007';

update email_classification_rules
set extra_patterns = (select array(select distinct unnest(extra_patterns || array['kra web portal account locked', 'kra web portal account unlocked']))),
    updated_at = now()
where id = '94101855-4c79-44bd-a506-4543e216dfe1';

insert into email_classification_rules
  (match_type, pattern, extra_patterns, category_key, confidence, sort_order, is_ignore, is_notify, sender_pattern, sender_match_type, notes)
values
  ('contains', 'unpaid payment registration numbers', array['unpaid prn'], 'demand_penalty', 0.9, 240, false, false, null, 'contains', 'Outstanding PRN notice from KRA'),
  ('contains', 'tax reminder', array[]::text[], 'demand_penalty', 0.85, 250, false, false, null, 'contains', null),
  ('contains', 'pending paye payment', array[]::text[], 'demand_penalty', 0.9, 260, false, false, null, 'contains', null)
on conflict (match_type, pattern, (coalesce(sender_pattern, ''))) where deleted_at is null do update set
  extra_patterns     = excluded.extra_patterns,
  category_key       = excluded.category_key,
  confidence         = excluded.confidence,
  sort_order         = excluded.sort_order,
  is_ignore          = excluded.is_ignore,
  is_notify          = excluded.is_notify,
  sender_match_type  = excluded.sender_match_type,
  notes              = excluded.notes,
  updated_at         = now();
