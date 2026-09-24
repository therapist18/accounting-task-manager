import type { Disposition } from "./types"

// KRA email categories are behaviour, not data — they live in code instead of a table.
//   creates_case      an email of this kind opens a case (a task row in email_case)
//   attaches_to_case  an email of this kind belongs to an existing case; without one it needs review
export interface CategoryDef {
  key: string
  name: string
  color: string
  disposition: Disposition
  creates_case: boolean
  attaches_to_case: boolean
}

const c = (
  key: string,
  name: string,
  color: string,
  disposition: Disposition,
  creates_case = false,
  attaches_to_case = false
): CategoryDef => ({ key, name, color, disposition, creates_case, attaches_to_case })

export const CATEGORIES: CategoryDef[] = [
  c("verification_notice", "Notice of Intention to Verify", "#dc2626", "action_required", true),
  c("pre_assessment", "Pre-Assessment Notice", "#dc2626", "action_required", true),
  c("failure_to_file", "Failure to File Returns", "#ea580c", "action_required", true),
  c("demand_penalty", "Demand / Penalty / Assessment", "#dc2626", "action_required", true),
  c("audit_notice", "Audit / Investigation Notice", "#dc2626", "action_required", true),
  c("document_request", "Request for Documents", "#ea580c", "action_required", true),
  c("appointment_notice", "Appointment / Registration Notice", "#ca8a04", "action_required", true),
  c("extension_response", "Extension of Time Response", "#2563eb", "update_only", false, true),
  c("bcl_response", "BCL Response to KRA", "#2563eb", "update_only", false, true),
  c("return_ack", "Return / Payment Acknowledgement", "#16a34a", "update_only"),
  c("certificate", "Certificate (WHT / TCC)", "#16a34a", "update_only"),
  c("statement", "Statement / Ledger", "#16a34a", "update_only"),
  // A notify rule's category: matched email is stored, flagged urgent and left in Needs Review for
  // someone to act on, but no KRA task/case is created (the rule exists for exactly that reason).
  c("notification", "Important Notification", "#f59e0b", "needs_review"),
  c("system_noise", "System / Non-KRA", "#6b7280", "ignore"),
  c("other_kra", "Other KRA Correspondence", "#6b7280", "needs_review"),
]

export const CATEGORY_BY_KEY = new Map(CATEGORIES.map((x) => [x.key, x]))

// Every email case belongs to this job level: department 2 (KRA), subdepartment 28 ("KRA ITAX EMAILS").
// Stored on each email_case row so a case can later be promoted to a tm_tasks row without guessing.
export const KRA_JOB_LEVEL = { level: 2, department_id: 2, subdepartment_id: 28 } as const
