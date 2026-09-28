-- Automation run history for the desktop app.
--
-- Replaces the queue role of the old `automation_jobs` table. There is no worker
-- and no polling dispatcher any more: the desktop app runs automations in a local
-- child process, so this table is history only - it records what ran, who ran it,
-- and how it turned out. Live progress is held in the automation server's memory.
--
-- Note what is NOT here: the automation payload. The previous flow stored the
-- assembled request - including the immigration portal password - in
-- automation_jobs.data, in plaintext. Nothing sensitive is persisted now; the
-- runner receives formData over loopback and only the outcome proof comes back.

create table if not exists public.tm_automation_runs (
  id                  uuid primary key default gen_random_uuid(),
  user_id             text        not null,
  ran_by_email        text,
  automation_type     text        not null,
  automation_id       text,
  task_id             text,
  task_label          text,

  -- Id assigned by the local automation server. Backfilled after the run is
  -- accepted, and used to resume live progress polling after a page refresh.
  -- Null for runs that never started (service unavailable, permission denied).
  job_id              text,

  -- pending | running | completed | failed | cancelled | interrupted
  status              text        not null default 'running',
  progress            smallint,
  current_step        text,
  error               text,

  -- Final portal screenshot, as a data URL. Written by /api/automations/complete.
  outcome_proof      text,

  -- Per-run capability token the local automation server uses to report its
  -- terminal result. Retired (nulled) once the run settles, so a captured token
  -- cannot be replayed against a finished run.
  completion_secret   text,

  started_at          timestamptz,
  completed_at        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists tm_automation_runs_user_created_idx
  on public.tm_automation_runs (user_id, created_at desc);

create index if not exists tm_automation_runs_task_idx
  on public.tm_automation_runs (task_id, created_at desc);

-- The progress endpoint resolves a run by (user_id, job_id) when a live job is no
-- longer in the automation server's memory, and the desktop shell sweeps rows
-- left in a running state on launch.
create index if not exists tm_automation_runs_job_idx
  on public.tm_automation_runs (user_id, job_id);

create index if not exists tm_automation_runs_status_idx
  on public.tm_automation_runs (status);

alter table public.tm_automation_runs enable row level security;

-- The Next server writes these rows with the service-role key after validating
-- the caller's Firebase session, and reads them back scoped to that user. The
-- client never talks to this table directly, so no anon/authenticated policies are
-- granted: with RLS on and no policy, direct client access is denied outright.
revoke all on public.tm_automation_runs from anon, authenticated;
