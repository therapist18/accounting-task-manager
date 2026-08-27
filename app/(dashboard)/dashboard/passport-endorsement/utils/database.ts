// @ts-nocheck
import { supabase } from "@/lib/supabase/client";
import { fetchTasks, type Task } from "../../tasks/utils/taskManagerData";

export const QUALIFYING_STATUSES = ["write_up_completed", "endorsed"];
export const IMMIGRATION_DEPT_ID = "1";

export interface Courier {
  id: string;
  name: string;
  courier_type: "on_demand" | "company";
  contact_phone: string | null;
  notes: string | null;
  is_active: boolean;
}

export interface PassportHandlingRecord {
  id: string;
  task_id: number;
  company_id: number | null;
  received_at: string | null;
  received_by: string | null;
  brought_by_name: string | null;
  taken_at: string | null;
  taken_by: string | null;
  returned_at: string | null;
  returned_by: string | null;
  client_notified_at: string | null;
  client_notified_by: string | null;
  dispatch_method: "delivery" | "pickup" | null;
  delivery_type: "staff" | "courier" | null;
  delivered_by: string | null;
  courier_id: string | null;
  courier_rider_name: string | null;
  courier_rider_phone: string | null;
  courier_tracking_ref: string | null;
  delivered_at: string | null;
  pickup_person_name: string | null;
  pickup_relation: "self" | "representative" | null;
  pickup_at: string | null;
  notes: string | null;
  created_by: string | null;
}

// Derived pipeline step — computed from which columns are already filled rather than stored,
// same convention tm_tasks.status/stages already follows elsewhere in this codebase (no separate
// tracked "current stage" column to drift out of sync with the data that actually backs it).
// For 'client' mode there's no chain of custody, so `returned_at`/`returned_by` are reused as the
// single "endorsement confirmed" timestamp/confirmer instead of adding dedicated columns.
export type HandlingStep =
  | "mode_unset"
  | "client_managed"
  | "awaiting_receipt"
  | "received"
  | "at_nyayo"
  | "stamped_back"
  | "ready_for_dispatch"
  | "out_for_delivery"
  | "awaiting_pickup"
  | "completed";

export const STEP_LABELS: Record<HandlingStep, string> = {
  mode_unset: "Mode Not Set",
  client_managed: "Client Managed",
  awaiting_receipt: "Awaiting Receipt",
  received: "Received — Not Yet Sent",
  at_nyayo: "At Nyayo House",
  stamped_back: "Stamped — Back In Office",
  ready_for_dispatch: "Ready For Dispatch",
  out_for_delivery: "Out For Delivery",
  awaiting_pickup: "Awaiting Pickup",
  completed: "Completed",
};

export function getHandlingStep(
  mode: "bcl" | "client" | null | undefined,
  record: PassportHandlingRecord | undefined
): HandlingStep {
  if (mode === "client") return record?.returned_at ? "completed" : "client_managed";
  if (mode !== "bcl") return "mode_unset";
  if (!record?.received_at) return "awaiting_receipt";
  if (!record.taken_at) return "received";
  if (!record.returned_at) return "at_nyayo";
  if (!record.client_notified_at) return "stamped_back";
  if (!record.dispatch_method) return "ready_for_dispatch";
  if (record.dispatch_method === "delivery" && !record.delivered_at) return "out_for_delivery";
  if (record.dispatch_method === "pickup" && !record.pickup_at) return "awaiting_pickup";
  return "completed";
}

export async function fetchQualifyingTasks(
  companies: Map<number, { name: string; prefix: string }>
): Promise<Task[]> {
  const tasks = await fetchTasks(IMMIGRATION_DEPT_ID, undefined, companies);
  return (Array.isArray(tasks) ? tasks : []).filter((t) => QUALIFYING_STATUSES.includes(t.status));
}

export async function fetchBclUsers(): Promise<{ id: string; name: string }[]> {
  const { data, error } = await supabase
    .from("scanner_users")
    .select("id, first_name, last_name, email")
    .eq("company_id", 10)
    .eq("is_active", true);
  if (error) {
    console.error("Error fetching BCL users:", error);
    return [];
  }
  return (data || []).map((u: any) => ({
    id: u.id,
    name: `${u.first_name || ""} ${u.last_name || ""}`.trim() || u.email || u.id,
  }));
}

export async function fetchCouriers(activeOnly = true): Promise<Courier[]> {
  let query = supabase.from("tm_couriers").select("*").order("name", { ascending: true });
  if (activeOnly) query = query.eq("is_active", true);
  const { data, error } = await query;
  if (error) {
    console.error("Error fetching couriers:", error);
    return [];
  }
  return data || [];
}

export async function createCourier(payload: {
  name: string;
  courier_type: "on_demand" | "company";
  contact_phone?: string | null;
  notes?: string | null;
}): Promise<Courier> {
  const { data, error } = await supabase.from("tm_couriers").insert([payload]).select().single();
  if (error) throw error;
  return data;
}

export async function updateCourier(id: string, patch: Partial<Courier>): Promise<Courier> {
  const { data, error } = await supabase
    .from("tm_couriers")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function setCourierActive(id: string, isActive: boolean): Promise<void> {
  const { error } = await supabase
    .from("tm_couriers")
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function fetchHandlingRecords(
  taskIds: number[]
): Promise<Map<number, PassportHandlingRecord>> {
  if (taskIds.length === 0) return new Map();
  const { data, error } = await supabase
    .from("tm_passport_handling")
    .select("*")
    .in("task_id", taskIds);
  if (error) {
    console.error("Error fetching passport handling records:", error);
    return new Map();
  }
  return new Map((data || []).map((r: PassportHandlingRecord) => [r.task_id, r]));
}

// Upserts by task_id — every wizard step calls this with just the fields that step owns, merged
// with any existing record so earlier steps' data is never clobbered.
export async function upsertHandlingRecord(
  taskId: number,
  companyId: number | null,
  patch: Partial<PassportHandlingRecord>,
  createdBy: string | null
): Promise<PassportHandlingRecord> {
  const { data: existing } = await supabase
    .from("tm_passport_handling")
    .select("id")
    .eq("task_id", taskId)
    .maybeSingle();

  const timestamp = new Date().toISOString();

  if (existing) {
    const { data, error } = await supabase
      .from("tm_passport_handling")
      .update({ ...patch, updated_at: timestamp })
      .eq("task_id", taskId)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  const { data, error } = await supabase
    .from("tm_passport_handling")
    .insert([{ task_id: taskId, company_id: companyId, created_by: createdBy, ...patch }])
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateTaskHandlingMode(taskId: number, mode: "bcl" | "client"): Promise<void> {
  const { error } = await supabase
    .from("tm_tasks")
    .update({ passport_handling_mode: mode, updated_at: new Date().toISOString() })
    .eq("id", taskId);
  if (error) throw error;
}

// Mirrors the existing "PP. Endorsement" stage's own status flip in immigration-tracker
// (tm_tasks.status -> 'endorsed') — the moment the passport is confirmed stamped (returned to
// the office in BCL mode, or confirmed by staff in client mode) IS endorsement completion, so
// this closes out the same status field rather than tracking a second, disconnected "done" flag.
export async function markTaskEndorsedIfPending(task: { id: number; status: string }): Promise<void> {
  if (task.status === "write_up_completed") {
    const { error } = await supabase
      .from("tm_tasks")
      .update({ status: "endorsed", updated_at: new Date().toISOString() })
      .eq("id", task.id);
    if (error) throw error;
  }
}
