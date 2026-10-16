create table if not exists public.email_custom_task_types (
  key text primary key check (key ~ '^[a-z][a-z0-9_]{1,79}$'),
  name text not null unique check (char_length(btrim(name)) between 2 and 100),
  created_at timestamptz not null default now(),
  created_by_id uuid
);

alter table public.email_custom_task_types enable row level security;

-- Access is through the authenticated email-center API using the server Supabase client.
