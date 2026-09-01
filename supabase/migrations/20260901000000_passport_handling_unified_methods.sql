-- Full redesign of how a passport moves in and out of the office, replacing the old two-tier
-- dispatch_method/delivery_type/pickup_relation combo (and the received side's plain
-- brought_by_name free-text field) with one unified 5-value method used identically on both
-- ends of the chain of custody:
--   client_self            - the client brings it in / picks it up themselves
--   client_representative  - the client sends someone they know
--   client_rider           - the client arranges their own rider/courier
--   bcl_rider               - BCL arranges a rider/courier (on_demand, e.g. Bolt/Uber; or a
--                             company courier, e.g. G4S/NTL - see tm_couriers.courier_type)
--   bcl_staff               - a BCL staff member does it in person
--
-- Data currently in tm_passport_handling is test data only (per product decision), so this is a
-- straight destructive redesign rather than a backward-compatible migration of existing rows.
TRUNCATE TABLE tm_passport_handling;

ALTER TABLE tm_passport_handling
  DROP COLUMN IF EXISTS brought_by_name,
  DROP COLUMN IF EXISTS dispatch_method,
  DROP COLUMN IF EXISTS delivery_type,
  DROP COLUMN IF EXISTS delivered_by,
  DROP COLUMN IF EXISTS courier_id,
  DROP COLUMN IF EXISTS courier_rider_name,
  DROP COLUMN IF EXISTS courier_rider_phone,
  DROP COLUMN IF EXISTS courier_tracking_ref,
  DROP COLUMN IF EXISTS delivered_at,
  DROP COLUMN IF EXISTS pickup_person_name,
  DROP COLUMN IF EXISTS pickup_relation,
  DROP COLUMN IF EXISTS pickup_at;

ALTER TABLE tm_passport_handling
  -- How the passport arrived at the office
  ADD COLUMN received_method TEXT
    CHECK (received_method IN ('client_self', 'client_representative', 'client_rider', 'bcl_rider', 'bcl_staff')),
  ADD COLUMN received_person_name TEXT,          -- representative's name (client_representative)
  ADD COLUMN received_courier_id UUID REFERENCES tm_couriers(id),   -- client_rider / bcl_rider
  ADD COLUMN received_rider_name TEXT,           -- only when the courier is 'on_demand'
  ADD COLUMN received_rider_phone TEXT,
  ADD COLUMN received_tracking_ref TEXT,         -- company courier waybill/tracking number

  -- How the passport is getting back to the client — dispatch_handled_by (added in
  -- 20260830000000) is kept as-is: the BCL staff point of contact, regardless of method.
  ADD COLUMN dispatch_method TEXT
    CHECK (dispatch_method IN ('client_self', 'client_representative', 'client_rider', 'bcl_rider', 'bcl_staff')),
  ADD COLUMN dispatch_person_name TEXT,
  ADD COLUMN dispatch_courier_id UUID REFERENCES tm_couriers(id),
  ADD COLUMN dispatch_rider_name TEXT,
  ADD COLUMN dispatch_rider_phone TEXT,
  ADD COLUMN dispatch_tracking_ref TEXT,
  ADD COLUMN dispatched_at TIMESTAMPTZ;           -- single timestamp for whichever method was used
