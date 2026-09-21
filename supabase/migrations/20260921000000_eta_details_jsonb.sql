-- Consolidate every ETA-workflow answer captured in EnquiryDialog into a single JSONB column,
-- tm_tasks.eta_details, instead of one column per field:
--   { purpose, traveler_intent, ticket_confirmed, tentative_arrival_date,
--     tentative_departure_date, confirmed_ticket_expected_date, return_ticket_is_real }
-- (dates are 'YYYY-MM-DD' strings; purpose is tourism | fresh_settlement | resettlement;
--  traveler_intent is visitor | extend_or_change_status).
--
-- Idempotent and safe whichever of the earlier eta_* migrations were applied: existing values
-- are backfilled into the JSON before the old columns are dropped, and any column that was never
-- created is simply skipped. A fresh database can run the earlier migrations then this one.

ALTER TABLE tm_tasks ADD COLUMN IF NOT EXISTS eta_details JSONB;

DO $$
DECLARE
  cols text[] := ARRAY[
    'eta_purpose', 'eta_traveler_intent', 'eta_ticket_confirmed',
    'eta_tentative_arrival_date', 'eta_tentative_departure_date',
    'eta_confirmed_ticket_expected_date', 'eta_return_ticket_is_real'
  ];
  present text[];
  expr text;
BEGIN
  SELECT array_agg(column_name::text) INTO present
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'tm_tasks' AND column_name = ANY (cols);

  IF present IS NOT NULL THEN
    -- Backfill only rows that have at least one old value and no eta_details yet.
    expr := (
      SELECT string_agg(
        format('%L, to_jsonb(%I)', substr(c, 5), c), ', ' ORDER BY c)
      FROM unnest(present) AS c
    );
    EXECUTE format(
      'UPDATE tm_tasks SET eta_details = jsonb_strip_nulls(jsonb_build_object(%s))
       WHERE eta_details IS NULL AND (%s)',
      expr,
      (SELECT string_agg(format('%I IS NOT NULL', c), ' OR ') FROM unnest(present) AS c)
    );

    FOREACH expr IN ARRAY present LOOP
      EXECUTE format('ALTER TABLE tm_tasks DROP COLUMN IF EXISTS %I', expr);
    END LOOP;
  END IF;
END $$;
