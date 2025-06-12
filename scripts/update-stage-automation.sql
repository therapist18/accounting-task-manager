-- Update the stages table to ensure proper ordering
UPDATE stages SET stage_order = 1 WHERE name = 'Pre-Verification';
UPDATE stages SET stage_order = 2 WHERE name = 'Document Collection';
UPDATE stages SET stage_order = 3 WHERE name = 'Tax Calculation';
UPDATE stages SET stage_order = 4 WHERE name = 'Filing Submission';
UPDATE stages SET stage_order = 5 WHERE name = 'Confirmation';

-- Add more sample stages for other subdepartments
INSERT INTO stages (subdepartment_id, name, time_estimate, follow_up_with, process_type, requires_upload, template_required, stage_order)
SELECT 
  s.id,
  stage.name,
  stage.time_estimate,
  stage.follow_up_with,
  stage.process_type,
  stage.requires_upload,
  stage.template_required,
  stage.stage_order
FROM subdepartments s
CROSS JOIN (
  VALUES 
    ('Initial Review', 480, 'Officer', 'Manual', false, false, 1),
    ('Document Verification', 1440, 'Client', 'Manual', true, true, 2),
    ('Application Processing', 2880, 'Officer', 'Online', false, false, 3),
    ('Quality Check', 720, 'Officer', 'Manual', false, false, 4),
    ('Final Approval', 480, 'Officer', 'Online', false, false, 5)
) AS stage(name, time_estimate, follow_up_with, process_type, requires_upload, template_required, stage_order)
WHERE s.name = 'Passport Applications'
AND NOT EXISTS (
  SELECT 1 FROM stages st WHERE st.subdepartment_id = s.id AND st.name = stage.name
);

-- Update tasks to have proper stage tracking
UPDATE tasks 
SET 
  current_stage_started_at = NOW() - INTERVAL '1 day',
  stage_order = 2
WHERE status IN ('Confirmed', 'Registered');
