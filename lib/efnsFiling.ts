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

// ── permit type → job level ─────────────────────────────────────────────────
// Which IMMIGRATION job levels (tm_departments 1 → tm_subdepartments, and a class where the portal
// says which) an EFNS item belongs to, so matching only looks at tasks of the right kind — a Special
// Pass notice is only ever filed to a KSP task. Few and stable, so kept in code.
export const IMMIGRATION_DEPARTMENT_ID = 1

/** A job level under IMMIGRATION; `classId` narrows it to one class (tm_tasks.class_id is a string). */
export interface EfnsJobLevel {
  subdepartmentId: number
  classId?: string
}

// Citizenship (subdepartment 5) classes the payment categories name.
const CITIZENSHIP = 5
const LAWFUL_RESIDENCE: EfnsJobLevel = { subdepartmentId: CITIZENSHIP, classId: "1750687875460" }

export const EFNS_PERMIT_JOB_LEVELS: Record<string, EfnsJobLevel[]> = {
  PERMIT: [{ subdepartmentId: 1 }], // KEP
  "SPECIAL PASS": [{ subdepartmentId: 3 }], // KSP
  "DEPENDANT PASS": [{ subdepartmentId: 2 }], // KDP
  "STUDENT PASS": [{ subdepartmentId: 4 }], // KPP
  FNS: [{ subdepartmentId: 6 }], // Foreign National Certificate (ALIEN)
  "VISITOR'S PASS": [{ subdepartmentId: 8 }], // Extension of Visitor's Pass
  "RE-ENTRY PASS": [{ subdepartmentId: 7 }], // Re-Entry Pass
  "PERMANENT RESIDENCE": [{ subdepartmentId: 10 }], // PR
  CITIZENSHIP: [{ subdepartmentId: CITIZENSHIP }], // Citizenship, any class
  "LAWFUL RESIDENT": [LAWFUL_RESIDENCE], // Citizenship → Lawful Residence
}

// Payment categories (immigration_payments.application_category, lower-cased) that name a class
// more precisely than their permit type does. Checked before EFNS_PERMIT_JOB_LEVELS.
export const EFNS_CATEGORY_JOB_LEVELS: Record<string, EfnsJobLevel[]> = {
  "lawful residents": [LAWFUL_RESIDENCE],
  "citizenship by marriage": [{ subdepartmentId: CITIZENSHIP, classId: "1750687876588" }],
  "children & dependants": [{ subdepartmentId: CITIZENSHIP, classId: "1750687876148" }],
  "persons with disability": [{ subdepartmentId: CITIZENSHIP, classId: "1750687878156" }],
}

/**
 * The job levels an item's tasks live in: its payment category's when that names one, otherwise its
 * permit type's; null when neither is mapped (search everything).
 */
export function itemJobLevels(permitGroup: string | null | undefined, category?: string | null): EfnsJobLevel[] | null {
  const byCategory = EFNS_CATEGORY_JOB_LEVELS[String(category || "").trim().toLowerCase()]
  if (byCategory?.length) return byCategory
  const byGroup = EFNS_PERMIT_JOB_LEVELS[String(permitGroup || "").trim().toUpperCase()]
  return byGroup?.length ? byGroup : null
}
