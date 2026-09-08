// Shared audit-trail helpers for the tasks-tracking module. Every DB write that represents a
// user action (create task, edit task, complete/skip a stage, upload a document, assign an
// officer, cancel/reactivate) should embed who did it so the trail is queryable per stage in the
// task's `stages` JSON as well as on the task/document rows themselves.
//
// The actor is the authenticated session user (useCurrentUser() — AuthUser). It carries an
// `id` (the auth user id, also used as the tm_tasks.created_by value) plus display fields.

import type { AuthUser } from "@/lib/hooks/use-current-user";

export interface AuditAction {
  by_id: string | null;
  by_name: string | null;
}

// Build a normalized "{action}_by" actor object from the authenticated user. Falls back to
// nulls when no user is available so callers never crash and always store an identifiable shape.
export function auditActor(user: AuthUser | null | undefined): AuditAction {
  if (!user) return { by_id: null, by_name: null };
  const name =
    user.displayName ||
    user.name ||
    (user.firstName && user.lastName ? `${user.firstName} ${user.lastName}`.trim() : "") ||
    null;
  return { by_id: user.id ?? user.userId ?? null, by_name: name };
}

// Convenience: a short printable label like "Jane Doe (abc-123)"
export function auditLabel(actor: AuditAction): string {
  if (!actor?.by_id) return "unknown";
  return actor.by_name ? `${actor.by_name} (${actor.by_id})` : actor.by_id;
}
