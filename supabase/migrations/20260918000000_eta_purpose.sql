-- ETA workflow, phase 4a: which of the three ETA purposes an enquiry is for. Tourism and Fresh
-- Settlement have no prior immigration-status history to auto-detect from, so those two are
-- always a manual pick; Resettlement is auto-selected by EnquiryDialog whenever the applicant
-- already has linkable prior documents (the same data source the existing "Related Document"
-- picker uses). Same shape as eta_traveler_intent/passport_handling_mode — a plain
-- CHECK-constrained text column on tm_tasks, no separate status table.
ALTER TABLE tm_tasks
  ADD COLUMN eta_purpose TEXT CHECK (eta_purpose IN ('tourism', 'fresh_settlement', 'resettlement'));
