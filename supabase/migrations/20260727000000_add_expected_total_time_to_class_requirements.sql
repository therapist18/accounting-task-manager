-- Overall Expected Time: sum of estimated_time (minutes) across every stage
-- applicable to one job level (subdepartment/class/subclass), auto-calculated
-- and kept in sync by the Stages module (departments/stages/page.tsx), and
-- read by the Reports module's "Expected Time" column instead of re-deriving
-- a partial total scoped to whichever stages one report happens to include.
ALTER TABLE tm_class_requirements
  ADD COLUMN expected_total_time_minutes INTEGER;
