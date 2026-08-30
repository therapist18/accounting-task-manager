-- Passport Endorsement Tracking: once an immigration task reaches the write-up stage, the
-- client's passport needs to be endorsed (stamped) at Nyayo House. passport_handling_mode
-- (set on the task itself, in EnquiryDialog) records whether BCL staff carry the passport
-- there and back ('bcl'), or the client handles that trip themselves ('client'). For 'bcl'
-- tasks, tm_passport_handling tracks the full chain of custody. No `status`/"current stage"
-- column is stored — same convention tm_tasks itself follows (DepartmentTasksManager derives
-- current stage from data present rather than a separate tracked column) — the current step is
-- derived client-side from which timestamp columns are already filled in, so there's only one
-- source of truth per record.

ALTER TABLE tm_tasks
  ADD COLUMN passport_handling_mode TEXT CHECK (passport_handling_mode IN ('bcl', 'client'));

-- Courier registry. Bolt/Uber are 'on_demand' — no fixed rider, so the specific rider's
-- name/phone is captured per-dispatch on tm_passport_handling instead of here. G4S is
-- 'company' — a fixed courier org, rider details optional per-dispatch.
CREATE TABLE tm_couriers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  courier_type TEXT NOT NULL CHECK (courier_type IN ('on_demand', 'company')),
  contact_phone TEXT,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO tm_couriers (name, courier_type) VALUES
  ('Bolt', 'on_demand'),
  ('Uber', 'on_demand'),
  ('G4S', 'company');

-- One row per task's stamping/dispatch cycle.
CREATE TABLE tm_passport_handling (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id BIGINT NOT NULL UNIQUE REFERENCES tm_tasks(id) ON DELETE CASCADE,
  company_id BIGINT,

  -- Client brings the passport in
  received_at TIMESTAMPTZ,
  received_by UUID REFERENCES scanner_users(id),
  brought_by_name TEXT,

  -- BCL staff takes it to Nyayo House
  taken_at TIMESTAMPTZ,
  taken_by UUID REFERENCES scanner_users(id),

  -- Stamped and brought back
  returned_at TIMESTAMPTZ,
  returned_by UUID REFERENCES scanner_users(id),

  -- Client informed it's ready (manual "mark as notified" — no automated send exists yet)
  client_notified_at TIMESTAMPTZ,
  client_notified_by UUID REFERENCES scanner_users(id),

  -- Getting it back to the client
  dispatch_method TEXT CHECK (dispatch_method IN ('delivery', 'pickup')),
  delivery_type TEXT CHECK (delivery_type IN ('staff', 'courier')),
  dispatch_handled_by UUID REFERENCES scanner_users(id),
  delivered_by UUID REFERENCES scanner_users(id),
  courier_id UUID REFERENCES tm_couriers(id),
  courier_rider_name TEXT,
  courier_rider_phone TEXT,
  courier_tracking_ref TEXT,
  delivered_at TIMESTAMPTZ,

  pickup_person_name TEXT,
  pickup_relation TEXT CHECK (pickup_relation IN ('self', 'representative')),
  pickup_at TIMESTAMPTZ,

  notes TEXT,
  created_by UUID REFERENCES scanner_users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_tm_passport_handling_task_id ON tm_passport_handling(task_id);
CREATE INDEX idx_tm_passport_handling_company_id ON tm_passport_handling(company_id);
