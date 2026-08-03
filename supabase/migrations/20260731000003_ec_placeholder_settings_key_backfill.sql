-- Data fix: repairs ec_placeholders rows left with source_kind reassigned to
-- 'settings_cascade'/'job_profile'/'offer' (via the inline Source Kind
-- select in PlaceholderSources.tsx) but no settings_key/offer_field ever
-- set - which the generic per-placeholder resolver in standardPlaceholders.ts
-- reads directly (effectiveSettings[settings_key]/offer[offer_field]), so a
-- null key there silently renders blank forever. Backfills settings_key to
-- match the placeholder's own token key, following the exact convention the
-- original seed migrations already used (settings_key === key for every
-- originally-seeded settings_cascade row, e.g. 'job_level' -> 'job_level').
-- Same fix now also happens automatically going forward - see
-- handleChangeSourceKind in PlaceholderSources.tsx.
UPDATE ec_placeholders
SET settings_key = key, updated_at = now()
WHERE source_kind IN ('settings_cascade', 'job_profile')
  AND (settings_key IS NULL OR settings_key = '');

UPDATE ec_placeholders
SET offer_field = key, updated_at = now()
WHERE source_kind = 'offer'
  AND (offer_field IS NULL OR offer_field = '');
