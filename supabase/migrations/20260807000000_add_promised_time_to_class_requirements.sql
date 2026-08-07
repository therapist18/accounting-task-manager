-- Promised Time: a manually entered turnaround commitment per job level (subdepartment/
-- class/subclass), set directly by the user in the Stages module (departments/stages/
-- page.tsx). Unlike expected_total_time_minutes, this is never auto-derived from
-- stage.estimated_time — it's whatever figure staff have promised the client for that job
-- level, optionally varying by Application Type.
--
-- Single JSONB column rather than separate default/conditions columns — it's one config
-- object, not two independent values, and this shape matches what the app reads/writes
-- directly with no reassembly:
--   { "defaultMinutes": number | null, "conditions": [{ "value": string, "minutes": number }] }
-- `defaultMinutes` applies when the task's Application Type doesn't match any condition;
-- `conditions[].value` is matched case-insensitively against the task's Application Type
-- (renewal_status) in Summary Reports.
ALTER TABLE tm_class_requirements
  ADD COLUMN promised_time JSONB;
