export type Disposition = "action_required" | "update_only" | "ignore" | "needs_review"

export type ApprovalStatus = "not_responded" | "pending" | "approved" | "rejected" | "not_applicable"

export const APPROVAL_STATUSES: ApprovalStatus[] = [
  "not_responded",
  "pending",
  "approved",
  "rejected",
  "not_applicable",
]

export const DISPOSITIONS: Disposition[] = ["action_required", "update_only", "ignore", "needs_review"]

// Below this confidence an email is never acted on automatically — it lands in Needs Review.
export const AUTO_CONFIDENCE_THRESHOLD = 0.8

export interface Actor {
  id: string | null
  type: "user" | "system"
}

export const SYSTEM_ACTOR: Actor = { id: null, type: "system" }
