import "server-only";
import { createServerSupabaseClient } from "@/lib/supabase";
import { withSupabaseRetry } from "@/lib/supabaseRetry";

export const getSupabaseAdmin = () => createServerSupabaseClient();

export const ROLE_ASSIGNMENTS_TABLE = "tm_role_assignments";
export const ROLE_ASSIGNMENTS_SELECT = [
  "id",
  "role",
  "user_id",
  "department_id",
  "subdepartment_id",
  "class_id",
  "subclass_id",
  "created_at"
].join(",");

export interface RoleAssignmentRow {
  id: number;
  role: "officer" | "manager" | "assistant";
  user_id: string;
  department_id: number | null;
  subdepartment_id: number | null;
  class_id: number | null;
  subclass_id: number | null;
  created_at: string | null;
}

export interface RoleAssignment {
  id?: number;
  role: "officer" | "manager" | "assistant";
  user_id: string;
  department_id: number | null;
  subdepartment_id: number | null;
  class_id: number | null;
  subclass_id: number | null;
  created_at?: string | null;
}

export async function getRoleAssignmentsByUserId(userId: string): Promise<RoleAssignment[]> {
  const supabase = getSupabaseAdmin();
  // This runs inside a Promise.all across every user on the page (listManagedScannerUsers) — heavy
  // enough concurrent Supabase traffic that a transient network blip (ECONNRESET / "fetch failed") on
  // any single one used to fail the whole page with a 500. withSupabaseRetry absorbs that; a real
  // error still throws exactly as before.
  const { data, error } = await withSupabaseRetry<any>(() =>
    supabase
      .from(ROLE_ASSIGNMENTS_TABLE)
      .select(ROLE_ASSIGNMENTS_SELECT)
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
  );

  if (error) throw error;
  return (data as unknown as RoleAssignmentRow[]) || [];
}

// One query for every user's role assignments, grouped by user_id — used wherever a whole list of
// users needs its assignments (listManagedScannerUsers), instead of firing one query per user. That
// used to mean up to ~80 concurrent Supabase connections for a single page load, which was the actual
// cause of the "fetch failed" 500s under load, not an occasional network blip retries could fix.
export async function getRoleAssignmentsByUserIds(userIds: string[]): Promise<Map<string, RoleAssignment[]>> {
  const byUser = new Map<string, RoleAssignment[]>();
  const uniqueIds = [...new Set(userIds)];
  if (!uniqueIds.length) return byUser;

  const supabase = getSupabaseAdmin();
  const { data, error } = await withSupabaseRetry<any>(() =>
    supabase
      .from(ROLE_ASSIGNMENTS_TABLE)
      .select(ROLE_ASSIGNMENTS_SELECT)
      .in("user_id", uniqueIds)
      .order("created_at", { ascending: false })
  );
  if (error) throw error;

  for (const row of (data as unknown as RoleAssignmentRow[]) || []) {
    const list = byUser.get(row.user_id);
    if (list) list.push(row);
    else byUser.set(row.user_id, [row]);
  }
  return byUser;
}

export async function setRoleAssignmentsForUser(userId: string, assignments: Omit<RoleAssignment, "id" | "created_at" | "user_id">[]): Promise<RoleAssignment[]> {
  const supabase = getSupabaseAdmin();

  // Delete existing assignments
  const { error: deleteError } = await supabase
    .from(ROLE_ASSIGNMENTS_TABLE)
    .delete()
    .eq("user_id", userId);

  if (deleteError) throw deleteError;

  // Create new assignments
  if (assignments.length === 0) return [];

  const assignmentsWithUserId = assignments.map(assignment => ({
    ...assignment,
    user_id: userId
  }));

  const { data, error } = await supabase
    .from(ROLE_ASSIGNMENTS_TABLE)
    .insert(assignmentsWithUserId.map(a => ({
      ...a,
      created_at: new Date().toISOString()
    })))
    .select(ROLE_ASSIGNMENTS_SELECT);

  if (error) throw error;
  return (data as unknown as RoleAssignmentRow[]) || [];
}
