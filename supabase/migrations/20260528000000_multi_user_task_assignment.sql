ALTER TABLE public.tm_task_diary
  ADD COLUMN IF NOT EXISTS assigned_to_user_ids TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS collaborator_ids TEXT[] NOT NULL DEFAULT '{}';

ALTER TABLE public.tm_recurring_templates
  ADD COLUMN IF NOT EXISTS collaborator_ids TEXT[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_tm_task_diary_assigned_to_user_ids
  ON public.tm_task_diary USING GIN (assigned_to_user_ids);
CREATE INDEX IF NOT EXISTS idx_tm_task_diary_collaborator_ids
  ON public.tm_task_diary USING GIN (collaborator_ids);
CREATE INDEX IF NOT EXISTS idx_tm_recurring_templates_collaborator_ids
  ON public.tm_recurring_templates USING GIN (collaborator_ids);
