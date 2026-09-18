-- ETA workflow, phase 4b: ticket logistics captured directly in EnquiryDialog at enquiry time,
-- replacing the old Travel Itinerary / Tentative Booking document uploads (removed from
-- VisaStatusTable in the bcl-registry app in the same change).
--
-- eta_ticket_confirmed: does the applicant already have a confirmed arrival ticket? If true, the
-- Airline/Cruise Ticket document (uploaded later, in the Individual Document Manager) is what
-- supplies the real dates. If false, the two tentative_* dates below are the best information
-- available, and eta_confirmed_ticket_expected_date records when the client says they'll have
-- the real ticket — VisaStatusTable counts down to that date.
--
-- eta_return_ticket_is_real: independent of the above — whether the return/departure leg is a
-- genuine ticket or a dummy booking (a common practice to satisfy visa/ETA requirements). When
-- false, the ticket's own Departure Date is not trusted for the return countdown; staff instead
-- wait for a real return ticket to be uploaded later.
ALTER TABLE tm_tasks
  ADD COLUMN eta_ticket_confirmed BOOLEAN,
  ADD COLUMN eta_tentative_arrival_date DATE,
  ADD COLUMN eta_tentative_departure_date DATE,
  ADD COLUMN eta_confirmed_ticket_expected_date DATE,
  ADD COLUMN eta_return_ticket_is_real BOOLEAN;
