export type Disposition = "action_required" | "update_only" | "ignore" | "needs_review"
export type ApprovalStatus = "not_responded" | "pending" | "approved" | "rejected" | "not_applicable"

export interface CaseRow {
  id: string
  case_ref: string
  company_id: string | null
  company_name: string | null
  gmail_thread_id: string | null
  category_key: string | null
  notice_type: string | null
  subject: string | null
  kra_pin: string | null
  kra_email_from: string | null
  kra_email_cc: string | null
  email_date: string | null
  deadline_date: string | null
  contents: string | null
  attachments_summary: string | null
  signing_officer_name: string | null
  signing_officer_position: string | null
  respond_date: string | null
  responded_by_id: string | null
  responded_by_name: string | null
  respond_contents: string | null
  promised_date: string | null
  approval_status: ApprovalStatus
  approval_date: string | null
  status: "open" | "closed"
  created_by_id: string | null
  created_by_name?: string | null
  assigned_to_id: string | null
  assigned_to_name: string | null
  assigned_by_name?: string | null
  assigned_at: string | null
  completed_by_id: string | null
  completed_by_name: string | null
  completed_at: string | null
}

export interface EmailRow {
  id: string
  gmail_message_id: string
  gmail_thread_id: string | null
  company_id: string | null
  company_name: string | null
  direction: "inbound" | "outbound"
  subject: string
  sender_email: string
  sender_name: string | null
  snippet: string | null
  ai_summary: string | null
  priority: "urgent" | "high" | "normal" | "low"
  is_read: boolean
  received_at: string
  has_attachments: boolean
  disposition: Disposition | null
  classification_source: string | null
  category_confidence: number | null
  review_reason: string | null
  kra_pin: string | null
  case_id: string | null
  category_key: string | null
}

export interface EmailDetail extends EmailRow {
  body: string
  to_addresses: string | null
  cc_addresses: string | null
}

export interface AttachmentRow {
  index: number
  filename: string
  mime_type: string | null
  size_bytes: number | null
  downloadable: boolean
}

export interface AccountRow {
  id: string
  email: string
  label: string | null
  status: string
  company_id: string | null
  company_name: string | null
  watch_expiry: string | null
  last_synced_at: string | null
  last_sync_error: string | null
}

export interface CompanyOption {
  id: string
  company_name: string
  kra_pin: string | null
}

export interface CategoryOption {
  id: string
  key: string
  name: string
  color: string | null
  disposition: Disposition | null
}

export interface StaffOption {
  id: string
  name: string
}

export const DISPOSITION_LABEL: Record<Disposition, string> = {
  action_required: "Action required",
  update_only: "Update only",
  ignore: "Ignored",
  needs_review: "Needs review",
}

export const APPROVAL_LABEL: Record<ApprovalStatus, string> = {
  not_responded: "Not responded",
  pending: "Pending KRA",
  approved: "Approved",
  rejected: "Rejected",
  not_applicable: "N/A",
}
