// Change history for job_applicant_cvs — mirrors bcl-registry's
// lib/jobApplicantAudit.ts (see its migration, 20260915000000_add_job_applicant_cvs_audit_log.sql,
// for why this lives on the row itself, an `audit_log` jsonb column, rather than a
// separate table). job_applicant_cvs is edited from both bcl-registry's Job Applicants
// list and this app's CV Builder, so every entry is tagged with which app made it.

const AUDIT_SKIP_FIELDS = new Set(["updated_by", "updated_at", "created_by", "created_at", "audit_log"]);

export interface AuditActor {
  id: string;
  displayName?: string | null;
  email?: string | null;
}

export type FieldChanges = Record<string, { old: any; new: any }>;

export function diffJobApplicantFields(
  payload: Record<string, any>,
  original: Record<string, any> | null | undefined
): FieldChanges {
  const changes: FieldChanges = {};
  if (!original) return changes;

  Object.entries(payload).forEach(([key, newVal]) => {
    if (AUDIT_SKIP_FIELDS.has(key)) return;
    const oldVal = original[key] ?? null;
    if (JSON.stringify(oldVal) !== JSON.stringify(newVal ?? null)) {
      changes[key] = { old: oldVal, new: newVal ?? null };
    }
  });

  return changes;
}

// Returns `{ audit_log: [...] }` to spread into the same update/upsert payload the
// caller is already sending — never a separate write. Returns `{}` (nothing to merge
// in) when there's no actor/original or the diff is empty, so callers can always do
// `.update({ ...payload, ...buildJobApplicantAuditLog(...) })` unconditionally.
export function buildJobApplicantAuditLog(
  payload: Record<string, any>,
  original: Record<string, any> | null | undefined,
  actor: AuditActor | null | undefined,
  sourceApp: "bcl-registry" | "cv-generator" = "cv-generator"
): { audit_log?: any[] } {
  if (!actor?.id || !original) return {};

  const changes = diffJobApplicantFields(payload, original);
  if (Object.keys(changes).length === 0) return {};

  const existingLog: any[] = Array.isArray(original.audit_log) ? original.audit_log : [];
  const entry = {
    changed_by_id: actor.id,
    changed_by_name: actor.displayName ?? null,
    changed_by_email: actor.email ?? null,
    changes,
    source_app: sourceApp,
    changed_at: new Date().toISOString(),
  };

  return { audit_log: [...existingLog, entry] };
}
