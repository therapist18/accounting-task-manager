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
