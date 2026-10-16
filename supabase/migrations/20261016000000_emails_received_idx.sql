-- The Email Center toolbar shows when the newest email arrived (GET /api/email-center: order by
-- received_at desc limit 1). The existing received_at indexes all lead with another column
-- (company_id / account_id / disposition), so without this that lookup sorts the whole table.
CREATE INDEX IF NOT EXISTS emails_received_idx ON emails (received_at DESC);
