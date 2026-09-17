-- ETA workflow, phase 1: when creating/editing an Immigration > ETA task, EnquiryDialog now
-- records whether the applicant intends to leave the country once their ETA/eVisa period is up
-- ('visitor'), or intends to stay on and will need a follow-on extension or change of status
-- ('extend_or_change_status'). Same shape as passport_handling_mode (a plain CHECK-constrained
-- text column set directly on tm_tasks from the dialog) — no `status`/"current stage" column,
-- consistent with how tm_tasks already avoids a separate tracked-stage column elsewhere.
--
-- This is the first of several planned phases (travel itinerary / tentative vs actual flight
-- ticket / endorsement-driven countdown / day-after-landing reminder) — those are not part of
-- this migration.
ALTER TABLE tm_tasks
  ADD COLUMN eta_traveler_intent TEXT CHECK (eta_traveler_intent IN ('visitor', 'extend_or_change_status'));
