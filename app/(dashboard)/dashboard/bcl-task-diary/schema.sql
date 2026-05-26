-- ============================================================
-- 1. RECURRING TASK TEMPLATES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.tm_recurring_templates (
  id                                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title                             TEXT NOT NULL,
  description                       TEXT NOT NULL DEFAULT '',

  -- Department hierarchy
  department_id                     BIGINT REFERENCES public.tm_departments(id) ON DELETE SET NULL,
  subdepartment_id                  BIGINT REFERENCES public.tm_subdepartments(id) ON DELETE SET NULL,
  class_id                          TEXT,
  subclass_id                       TEXT,
  job_level                         JSONB NOT NULL DEFAULT '{}',

  -- Default user assignments
  assigned_to_user_id               UUID REFERENCES public.scanner_users(id) ON DELETE SET NULL,
  officer_id                        UUID REFERENCES public.scanner_users(id) ON DELETE SET NULL,
  manager_id                        UUID REFERENCES public.scanner_users(id) ON DELETE SET NULL,
  assistant_id                      UUID REFERENCES public.scanner_users(id) ON DELETE SET NULL,

  -- Recurrence config
  priority                          TEXT NOT NULL DEFAULT 'medium'
                                      CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  frequency                         TEXT NOT NULL
                                      CHECK (frequency IN ('daily', 'weekly', 'monthly')),
  day_of_month                      SMALLINT CHECK (day_of_month BETWEEN 1 AND 31),
  day_of_week                       SMALLINT CHECK (day_of_week BETWEEN 0 AND 6),

  -- Scheduling
  start_date                        DATE NOT NULL,
  next_run_at                       TIMESTAMPTZ NOT NULL,
  active                            BOOLEAN NOT NULL DEFAULT TRUE,

  -- Defaults for generated tasks
  default_reminder_offsets_minutes  INTEGER[] DEFAULT '{}',
  tags                              TEXT[] DEFAULT '{}',

  created_by_user_id                UUID NOT NULL REFERENCES public.scanner_users(id) ON DELETE RESTRICT,
  created_at                        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tm_templates_next_run
  ON public.tm_recurring_templates (next_run_at)
  WHERE active = TRUE;

CREATE INDEX IF NOT EXISTS idx_tm_templates_dept
  ON public.tm_recurring_templates (department_id);

CREATE INDEX IF NOT EXISTS idx_tm_templates_job_level
  ON public.tm_recurring_templates USING GIN (job_level);

ALTER TABLE public.tm_recurring_templates ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 2. TASK INSTANCES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.tm_task_diary (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title                 TEXT NOT NULL,
  description           TEXT NOT NULL DEFAULT '',
  status                TEXT NOT NULL DEFAULT 'todo'
                          CHECK (status IN ('todo', 'in_progress', 'done', 'cancelled')),
  priority              TEXT NOT NULL DEFAULT 'medium'
                          CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  type                  TEXT NOT NULL DEFAULT 'personal'
                          CHECK (type IN ('personal', 'department', 'system')),

  -- Department hierarchy
  department_id         BIGINT REFERENCES public.tm_departments(id) ON DELETE SET NULL,
  subdepartment_id      BIGINT REFERENCES public.tm_subdepartments(id) ON DELETE SET NULL,
  class_id              TEXT,
  subclass_id           TEXT,
  job_level             JSONB NOT NULL DEFAULT '{}',

  -- User assignments
  created_by_user_id    UUID NOT NULL REFERENCES public.scanner_users(id) ON DELETE RESTRICT,
  assigned_to_user_id   UUID REFERENCES public.scanner_users(id) ON DELETE SET NULL,
  officer_id            UUID REFERENCES public.scanner_users(id) ON DELETE SET NULL,
  manager_id            UUID REFERENCES public.scanner_users(id) ON DELETE SET NULL,
  assistant_id          UUID REFERENCES public.scanner_users(id) ON DELETE SET NULL,

  -- Scheduling
  start_date            DATE NOT NULL,
  due_date              DATE NOT NULL,
  completed_at          TIMESTAMPTZ,

  -- Metadata
  tags                  TEXT[] DEFAULT '{}',
  notes                 TEXT,
  recurring_template_id UUID REFERENCES public.tm_recurring_templates(id) ON DELETE SET NULL,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tm_task_diary_assigned_user
  ON public.tm_task_diary (assigned_to_user_id);

CREATE INDEX IF NOT EXISTS idx_tm_task_diary_created_by
  ON public.tm_task_diary (created_by_user_id);

CREATE INDEX IF NOT EXISTS idx_tm_task_diary_department
  ON public.tm_task_diary (department_id);

CREATE INDEX IF NOT EXISTS idx_tm_task_diary_subdepartment
  ON public.tm_task_diary (subdepartment_id);

CREATE INDEX IF NOT EXISTS idx_tm_task_diary_status
  ON public.tm_task_diary (status);

CREATE INDEX IF NOT EXISTS idx_tm_task_diary_due_date
  ON public.tm_task_diary (due_date);

CREATE INDEX IF NOT EXISTS idx_tm_task_diary_job_level
  ON public.tm_task_diary USING GIN (job_level);

CREATE INDEX IF NOT EXISTS idx_tm_task_diary_user_status
  ON public.tm_task_diary (created_by_user_id, status);

ALTER TABLE public.tm_task_diary ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 3. TASK REMINDERS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.tm_reminders (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id         UUID NOT NULL REFERENCES public.tm_task_diary(id) ON DELETE CASCADE,
  remind_at       TIMESTAMPTZ NOT NULL,
  channels        TEXT[] NOT NULL DEFAULT '{in_app}',
  delivered_at    TIMESTAMPTZ,
  snoozed_until   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tm_reminders_task
  ON public.tm_reminders (task_id);

CREATE INDEX IF NOT EXISTS idx_tm_reminders_pending
  ON public.tm_reminders (remind_at)
  WHERE delivered_at IS NULL;

ALTER TABLE public.tm_reminders ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 4. NOTIFICATION DELIVERIES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.tm_notification_deliveries (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reminder_id         UUID NOT NULL REFERENCES public.tm_reminders(id) ON DELETE CASCADE,
  channel             TEXT NOT NULL CHECK (channel IN ('in_app', 'push', 'email', 'whatsapp')),
  status              TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'sent', 'failed')),
  provider_message_id TEXT,
  error_message       TEXT,
  delivered_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tm_deliveries_reminder
  ON public.tm_notification_deliveries (reminder_id);

CREATE INDEX IF NOT EXISTS idx_tm_deliveries_pending
  ON public.tm_notification_deliveries (status)
  WHERE status = 'pending';

ALTER TABLE public.tm_notification_deliveries ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 5. UPDATED_AT TRIGGER
-- ============================================================
CREATE OR REPLACE FUNCTION public.tm_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tm_task_diary_updated_at ON public.tm_task_diary;
CREATE TRIGGER trg_tm_task_diary_updated_at
  BEFORE UPDATE ON public.tm_task_diary
  FOR EACH ROW EXECUTE FUNCTION public.tm_set_updated_at();

DROP TRIGGER IF EXISTS trg_tm_templates_updated_at ON public.tm_recurring_templates;
CREATE TRIGGER trg_tm_templates_updated_at
  BEFORE UPDATE ON public.tm_recurring_templates
  FOR EACH ROW EXECUTE FUNCTION public.tm_set_updated_at();

-- ============================================================
-- 6. RLS POLICIES
-- ============================================================
-- NOTE: This app uses Firebase auth, NOT Supabase auth.
-- auth.uid() is always NULL for requests from the app (anon key).
-- DO NOT reference scanner_users inside RLS policies — it has its
-- own RLS policy that queries scanner_users, causing infinite recursion.
-- Authorization is enforced at the application layer (Firebase + middleware).
-- These policies grant full access to the anon role so the app can read/write.

DROP POLICY IF EXISTS "tm_task_diary_select" ON public.tm_task_diary;
DROP POLICY IF EXISTS "tm_task_diary_insert" ON public.tm_task_diary;
DROP POLICY IF EXISTS "tm_task_diary_update" ON public.tm_task_diary;
DROP POLICY IF EXISTS "tm_task_diary_delete" ON public.tm_task_diary;
DROP POLICY IF EXISTS "tm_task_diary_all"    ON public.tm_task_diary;

CREATE POLICY "tm_task_diary_all" ON public.tm_task_diary
  FOR ALL TO anon, authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "tm_templates_select" ON public.tm_recurring_templates;
DROP POLICY IF EXISTS "tm_templates_insert" ON public.tm_recurring_templates;
DROP POLICY IF EXISTS "tm_templates_update" ON public.tm_recurring_templates;
DROP POLICY IF EXISTS "tm_templates_delete" ON public.tm_recurring_templates;
DROP POLICY IF EXISTS "tm_templates_all"    ON public.tm_recurring_templates;

CREATE POLICY "tm_templates_all" ON public.tm_recurring_templates
  FOR ALL TO anon, authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "tm_reminders_select" ON public.tm_reminders;
DROP POLICY IF EXISTS "tm_reminders_all"    ON public.tm_reminders;

CREATE POLICY "tm_reminders_all" ON public.tm_reminders
  FOR ALL TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- 7. BACKGROUND JOB FUNCTIONS
-- ============================================================
CREATE OR REPLACE FUNCTION public.tm_generate_recurring_tasks()
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  tmpl          RECORD;
  new_due_date  DATE;
  tasks_created INTEGER := 0;
BEGIN
  FOR tmpl IN
    SELECT *
    FROM public.tm_recurring_templates
    WHERE active = TRUE
      AND next_run_at <= NOW()
    FOR UPDATE SKIP LOCKED
  LOOP
    new_due_date := CASE tmpl.frequency
      WHEN 'daily'   THEN NOW()::DATE
      WHEN 'weekly'  THEN (NOW() + INTERVAL '6 days')::DATE
      WHEN 'monthly' THEN (DATE_TRUNC('month', NOW()) + INTERVAL '1 month - 1 day')::DATE
    END;

    INSERT INTO public.tm_task_diary (
      title, description, status, priority, type,
      department_id, subdepartment_id, class_id, subclass_id, job_level,
      created_by_user_id, assigned_to_user_id, officer_id, manager_id, assistant_id,
      start_date, due_date, tags, recurring_template_id
    )
    VALUES (
      tmpl.title, tmpl.description, 'todo', tmpl.priority, 'system',
      tmpl.department_id, tmpl.subdepartment_id, tmpl.class_id, tmpl.subclass_id, tmpl.job_level,
      tmpl.created_by_user_id,
      COALESCE(tmpl.assigned_to_user_id, tmpl.officer_id),
      tmpl.officer_id, tmpl.manager_id, tmpl.assistant_id,
      NOW()::DATE, new_due_date, tmpl.tags, tmpl.id
    );

    UPDATE public.tm_recurring_templates
    SET next_run_at = CASE frequency
      WHEN 'daily'   THEN next_run_at + INTERVAL '1 day'
      WHEN 'weekly'  THEN next_run_at + INTERVAL '7 days'
      WHEN 'monthly' THEN next_run_at + INTERVAL '1 month'
    END
    WHERE id = tmpl.id;

    tasks_created := tasks_created + 1;
  END LOOP;

  RETURN tasks_created;
END;
$$;

CREATE OR REPLACE FUNCTION public.tm_get_due_reminders()
RETURNS TABLE (
  reminder_id UUID,
  task_id     UUID,
  task_title  TEXT,
  channels    TEXT[],
  remind_at   TIMESTAMPTZ
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    r.id,
    r.task_id,
    t.title,
    r.channels,
    r.remind_at
  FROM public.tm_reminders r
  JOIN public.tm_task_diary t ON t.id = r.task_id
  WHERE r.remind_at <= NOW()
    AND r.delivered_at IS NULL
    AND (r.snoozed_until IS NULL OR r.snoozed_until <= NOW());
END;
$$;

CREATE OR REPLACE FUNCTION public.tm_mark_reminders_delivered(reminder_ids UUID[])
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.tm_reminders
  SET delivered_at = NOW()
  WHERE id = ANY(reminder_ids)
    AND delivered_at IS NULL;
END;
$$;

-- ============================================================
-- 8. HELPFUL VIEWS
-- ============================================================
CREATE OR REPLACE VIEW public.tm_task_diary_enriched AS
SELECT
  t.*,
  d.name AS department_name,
  sd.name AS subdepartment_name,
  cu.first_name || ' ' || cu.last_name AS created_by_name,
  cu.email AS created_by_email,
  au.first_name || ' ' || au.last_name AS assigned_to_name,
  au.email AS assigned_to_email
FROM public.tm_task_diary t
LEFT JOIN public.tm_departments d ON d.id = t.department_id
LEFT JOIN public.tm_subdepartments sd ON sd.id = t.subdepartment_id
LEFT JOIN public.scanner_users cu ON cu.id = t.created_by_user_id
LEFT JOIN public.scanner_users au ON au.id = t.assigned_to_user_id;

CREATE OR REPLACE VIEW public.tm_overdue_tasks AS
SELECT
  t.id,
  t.title,
  t.priority,
  t.due_date,
  NOW()::DATE - t.due_date AS days_overdue,
  t.department_id,
  d.name AS department_name,
  t.assigned_to_user_id,
  au.first_name || ' ' || au.last_name AS assigned_to_name
FROM public.tm_task_diary t
LEFT JOIN public.tm_departments d ON d.id = t.department_id
LEFT JOIN public.scanner_users au ON au.id = t.assigned_to_user_id
WHERE t.due_date < NOW()::DATE
  AND t.status NOT IN ('done', 'cancelled')
ORDER BY t.due_date ASC;