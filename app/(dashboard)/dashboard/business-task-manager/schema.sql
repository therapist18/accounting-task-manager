-- Isolated production schema for the BCL Business Task Manager / Diary module.
-- Apply this as a future Supabase migration when the UI is connected to live data.

create table if not exists btm_tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  status text not null default 'todo'
    check (status in ('todo', 'in_progress', 'done', 'cancelled')),
  priority text not null default 'medium'
    check (priority in ('low', 'medium', 'high', 'urgent')),
  task_type text not null default 'user'
    check (task_type in ('user', 'department', 'system')),
  department_id text not null,
  created_by_user_id text not null,
  assigned_to_user_id text,
  start_date timestamptz not null default now(),
  due_date timestamptz not null,
  tags text[] not null default '{}',
  recurring_template_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists btm_recurring_task_templates (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  department_id text not null,
  assigned_to_user_id text,
  priority text not null default 'medium'
    check (priority in ('low', 'medium', 'high', 'urgent')),
  frequency text not null
    check (frequency in ('daily', 'weekly', 'monthly')),
  tags text[] not null default '{}',
  start_date timestamptz not null default now(),
  next_run_at timestamptz not null,
  active boolean not null default true,
  default_reminder_offsets_minutes integer[] not null default '{}',
  created_by_user_id text not null,
  created_at timestamptz not null default now()
);

alter table btm_tasks
  add constraint btm_tasks_recurring_template_id_fkey
  foreign key (recurring_template_id)
  references btm_recurring_task_templates(id)
  on delete set null;

create table if not exists btm_task_reminders (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references btm_tasks(id) on delete cascade,
  remind_at timestamptz not null,
  channels text[] not null default '{in_app}',
  delivered_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists btm_notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  reminder_id uuid not null references btm_task_reminders(id) on delete cascade,
  channel text not null check (channel in ('in_app', 'push', 'email', 'whatsapp')),
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  provider_message_id text,
  error_message text,
  delivered_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists btm_tasks_assigned_to_user_id_idx on btm_tasks (assigned_to_user_id);
create index if not exists btm_tasks_created_by_user_id_idx on btm_tasks (created_by_user_id);
create index if not exists btm_tasks_department_id_idx on btm_tasks (department_id);
create index if not exists btm_tasks_due_date_idx on btm_tasks (due_date);
create index if not exists btm_task_reminders_due_idx on btm_task_reminders (remind_at) where delivered_at is null;
create index if not exists btm_templates_next_run_idx on btm_recurring_task_templates (next_run_at) where active = true;

alter table btm_tasks enable row level security;
alter table btm_task_reminders enable row level security;
alter table btm_recurring_task_templates enable row level security;
alter table btm_notification_deliveries enable row level security;

-- Replace these predicates with the platform's final session helper once connected.
-- Admins should have unrestricted access. Non-admins should be limited to:
-- created_by_user_id = current user, assigned_to_user_id = current user,
-- or task department membership through role assignments.
