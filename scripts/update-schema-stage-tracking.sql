-- Add stage tracking tables
CREATE TABLE IF NOT EXISTS task_stage_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
  stage_id UUID REFERENCES stages(id),
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,
  estimated_duration INTEGER NOT NULL, -- in minutes
  actual_duration INTEGER, -- in minutes, calculated when completed
  is_overdue BOOLEAN DEFAULT false,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed', 'skipped')),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add task assignments table
CREATE TABLE IF NOT EXISTS task_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
  assigned_by TEXT REFERENCES users(id),
  assigned_to TEXT REFERENCES users(id),
  role TEXT CHECK (role IN ('task_manager', 'task_assistant')),
  assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  is_active BOOLEAN DEFAULT true,
  notes TEXT
);

-- Add notifications table (for task assignments)
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT DEFAULT 'info' CHECK (type IN ('info', 'warning', 'success', 'error')),
  is_read BOOLEAN DEFAULT false,
  related_task_id UUID REFERENCES tasks(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Update tasks table to include current stage tracking
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS current_stage_started_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS stage_order INTEGER DEFAULT 1;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_task_stage_history_task ON task_stage_history(task_id);
CREATE INDEX IF NOT EXISTS idx_task_stage_history_stage ON task_stage_history(stage_id);
CREATE INDEX IF NOT EXISTS idx_task_assignments_task ON task_assignments(task_id);
CREATE INDEX IF NOT EXISTS idx_task_assignments_user ON task_assignments(assigned_to);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read);
