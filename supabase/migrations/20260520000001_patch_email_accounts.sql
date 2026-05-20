-- Patch existing email_accounts table to add columns needed by the Gmail task manager
ALTER TABLE email_accounts
  ADD COLUMN IF NOT EXISTS history_id bigint DEFAULT 0,
  ADD COLUMN IF NOT EXISTS watch_expiry timestamptz;

-- email_categories and emails are new tables — create them now
create table if not exists email_categories (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  description text,
  color text default '#6B7280',
  icon text default 'Inbox',
  is_system boolean default true,
  sort_order integer default 0,
  created_at timestamptz default now()
);

create table if not exists emails (
  id uuid default gen_random_uuid() primary key,
  account_id uuid references email_accounts(id) on delete cascade,
  gmail_message_id text unique not null,
  gmail_thread_id text,
  subject text,
  sender_email text,
  sender_name text,
  recipient_emails text[] default '{}',
  body_plain text,
  snippet text,
  category_id uuid references email_categories(id),
  category_confidence float,
  ai_summary text,
  priority text default 'normal' check (priority in ('urgent', 'high', 'normal', 'low')),
  labels text[] default '{}',
  is_read boolean default false,
  is_starred boolean default false,
  received_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Seed categories
insert into email_categories (name, description, color, icon, is_system, sort_order) values
  ('Client Inquiry',       'Questions and requests from clients',              '#3B82F6', 'HelpCircle',    true, 1),
  ('Invoice/Payment',      'Billing, invoices, payments, and quotes',          '#10B981', 'CreditCard',    true, 2),
  ('Project Updates',      'Progress reports, deliverables, and timelines',    '#8B5CF6', 'Briefcase',     true, 3),
  ('HR/Admin',             'HR matters and administrative communications',     '#F59E0B', 'Users',         true, 4),
  ('Legal/Compliance',     'Contracts, legal notices, and regulatory matters', '#EF4444', 'Scale',         true, 5),
  ('Internal',             'Internal team communications',                     '#6B7280', 'Building2',     true, 6),
  ('Newsletter/Marketing', 'Newsletters, promotions, and marketing emails',    '#EC4899', 'Megaphone',     true, 7),
  ('Support Request',      'Issues, bug reports, and support tickets',         '#F97316', 'Wrench',        true, 8),
  ('Other',                'Emails that don''t fit other categories',          '#94A3B8', 'MoreHorizontal',true, 9)
on conflict do nothing;

-- RLS
alter table email_categories enable row level security;
alter table emails           enable row level security;
create policy "allow_all" on email_categories for all using (true);
create policy "allow_all" on emails           for all using (true);

-- Realtime
alter publication supabase_realtime add table emails;

-- Indexes
create index if not exists idx_emails_account_id  on emails(account_id);
create index if not exists idx_emails_category_id on emails(category_id);
create index if not exists idx_emails_received_at on emails(received_at desc);
create index if not exists idx_emails_is_read     on emails(is_read);
create index if not exists idx_emails_gmail_id    on emails(gmail_message_id);
