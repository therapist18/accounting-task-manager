// EFNS auto-filing, the parts shared by the Stages Management dialogs (where a stage document is set
// to be filled from EFNS) and the filing job (lib/efnsFiling.server.ts, which files each EFNS
// notification / payment into the matching task's stage document).
//
// Statuses and permit groups are exactly the Immigration Notifications page's (and the EFNS WhatsApp
// group's): see lib/immigrationNotifications.ts.

import { PERMIT_GROUP_PREFERRED, STATUS_PREFERRED } from "@/lib/immigrationNotifications"

/**
 * Set on a stage document (StageDocument.efnsTrigger): EFNS items of one of these permit groups AND
 * one of these statuses fill this document, and complete its stage. An empty list matches nothing,
 * so a half-set trigger never files anything.
 */
export interface EfnsTrigger {
  permitGroups: string[]
  statuses: string[]
}

/** Choices for the stage dialog. */
export const EFNS_PERMIT_GROUPS = PERMIT_GROUP_PREFERRED
/** Notification statuses plus the payment ones (invoice NOT PAID / receipt PAID). */
export const EFNS_STATUSES = STATUS_PREFERRED

export function isEfnsTriggerSet(trigger: EfnsTrigger | null | undefined): trigger is EfnsTrigger {
  return !!trigger && trigger.permitGroups?.length > 0 && trigger.statuses?.length > 0
}

export function efnsTriggerMatches(trigger: EfnsTrigger | null | undefined, permitGroup: string, status: string): boolean {
  if (!isEfnsTriggerSet(trigger)) return false
  const norm = (s: string) => s.trim().toUpperCase()
  return trigger.permitGroups.some((g) => norm(g) === norm(permitGroup)) && trigger.statuses.some((s) => norm(s) === norm(status))
}

/** Filing outcomes stored on immigration_notifications / immigration_payments.filing_status. */
export type EfnsFilingStatus = "filed" | "no_rule" | "no_match" | "ambiguous" | "error"

export const EFNS_FILING_LABELS: Record<EfnsFilingStatus, string> = {
  filed: "Filed to task",
  no_rule: "No stage set for it",
  no_match: "Needs a task",
  ambiguous: "Needs a task (several match)",
  error: "Filing failed",
}

/** Statuses that wait for someone to pick the task by hand. */
export const EFNS_NEEDS_TASK: EfnsFilingStatus[] = ["no_match", "ambiguous"]

/** How an item was matched to its task. */
export type EfnsMatchedBy = "file_number" | "name" | "manual"

/**
 * The link recorded on the item's `filing` JSONB column once it's filed (or attempted). Mirrors the
 * shape documented in migration 20261015000000_efns_auto_filing.sql. `document_id` is the
 * acc_portal_directors_documents row and `kyc_document_id` its document type; `individual_id` is the
 * task's individual (the person the PDF is filed against).
 */
export interface EfnsFilingRecord {
  task_id: number | string
  stage_id: string
  stage_name?: string
  kyc_document_id?: string
  document_id?: string | number
  individual_id?: number | null
  // The task's job level at filing time, so the link survives later stage reconfiguration.
  job_level?: {
    department_id?: number | null
    subdepartment_id?: number | null
    class_id?: string | number | null
    subclass_id?: string | number | null
  } | null
  matched_by: EfnsMatchedBy
  by_id?: string | null
  // Set for no_match/ambiguous: the tasks that looked plausible, so the "Needs a task" list can
  // show them without re-running the whole match.
  candidates?: Array<{ id: number | string; applicant_name?: string | null; r_number?: string | null }>
  error?: string
}

// Shared badge colours for the filing status, so the notifications table styles it consistently.
export const EFNS_FILING_BADGE: Record<EfnsFilingStatus, string> = {
  filed: "border-emerald-200 bg-emerald-50 text-emerald-700",
  no_rule: "border-slate-200 bg-slate-50 text-slate-600",
  no_match: "border-amber-200 bg-amber-50 text-amber-700",
  ambiguous: "border-amber-200 bg-amber-50 text-amber-700",
  error: "border-red-200 bg-red-50 text-red-700",
}
