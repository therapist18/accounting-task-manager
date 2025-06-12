-- Insert sample task stage history
INSERT INTO task_stage_history (task_id, stage_id, started_at, estimated_duration, status)
SELECT 
  t.id,
  s.id,
  NOW() - INTERVAL '2 days',
  s.time_estimate,
  'active'
FROM tasks t
JOIN subdepartments sd ON t.subdepartment_id = sd.id
JOIN stages s ON s.subdepartment_id = sd.id
WHERE s.stage_order = 1
LIMIT 3;

-- Insert sample task assignments
INSERT INTO task_assignments (task_id, assigned_by, assigned_to, role, assigned_at)
SELECT 
  t.id,
  'admin_user_id', -- This would be the actual admin user ID
  t.task_manager_id,
  'task_manager',
  NOW() - INTERVAL '1 day'
FROM tasks t
LIMIT 5;

-- Insert sample notifications
INSERT INTO notifications (user_id, title, message, type, related_task_id)
SELECT 
  t.task_manager_id,
  'New Task Assigned',
  'You have been assigned as Task Manager for: ' || t.job_description,
  'info',
  t.id
FROM tasks t
LIMIT 3;
