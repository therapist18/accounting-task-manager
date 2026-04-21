import "server-only";
import { createServerSupabaseClient } from "@/lib/supabase";

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
  const { data, error } = await supabase
    .from(ROLE_ASSIGNMENTS_TABLE)
    .select(ROLE_ASSIGNMENTS_SELECT)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data as unknown as RoleAssignmentRow[]) || [];
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
