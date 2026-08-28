// @ts-nocheck
import { supabase } from "@/lib/supabase/client";
import { fetchTasks, getLinkedDocumentsForTaskStage, type Task } from "../../tasks/utils/taskManagerData";
import { calculateStageDate, findDateInObject } from "../../tasks/utils/dateUtils";

export const QUALIFYING_STATUSES = ["write_up_completed", "endorsed"];
export const IMMIGRATION_DEPT_ID = "1";

// Same "Write Up" stage DepartmentTasksManager itself renders/edits (flips tm_tasks.status to
// 'write_up_completed' when its date is set — see DepartmentTasksManager.tsx's
// STAGE_STATUS_MAPPING) — this is exactly the moment a task becomes eligible to appear in this
// module, so surfacing its own date here lets staff see how long a task has been sitting since.
export const WRITE_UP_STAGE_ID = "072b9710-45df-4a05-ba65-01b4ef29d61d";

// A stage cell's displayed date is NOT just task.stages[id].date/.completedAt — EditableStageCell
// (app/(dashboard)/dashboard/tasks/components/EditableStageCell.tsx:240-247) always recomputes it
// via calculateStageDate (../tasks/utils/dateUtils.ts:249), which for a document-backed stage
// prioritizes a document field flagged isImmigrationDate (a fact printed on the uploaded
// document, e.g. a permit's own date) over the plain workflow "completedAt" timestamp (when
// staff marked the stage done) — falling back to completedAt only if no such document field
// resolves, or to stageData.date for stages with no document requirement at all. Replicated
// here with the real inputs (the actual stage config's `documents` requirement, the task's
// linked document, and that document's KYC field definitions) rather than reading
// stages[id].date/.completedAt directly, so this shows the exact same value DepartmentTasksManager
// itself would render for this stage — not a workflow-timestamp approximation of it.
export function resolveWriteUpDate(
  task: any,
  writeUpStage: any,
  allDocuments: any[],
  kycDocuments: Map<string, any>
): string | null {
  const stageData = task?.stages?.[WRITE_UP_STAGE_ID];
  if (!stageData) return null;
  const stage = writeUpStage || { id: WRITE_UP_STAGE_ID };
  const linkedDocument = getLinkedDocumentsForTaskStage(task, stage, allDocuments || [])?.[0] || null;
  // getKycFields({ kycId }) is always called with linkedDocument.document_id as the kycId (see
  // EditableStageCell.tsx:213 and DepartmentTasksManager.tsx:1150-1154) — document_id is the FK
  // to the KYC document TYPE, not the uploaded row's own id.
  const documentFields = linkedDocument ? (kycDocuments?.get(linkedDocument.document_id)?.fields || []) : [];
  const value = stageData?.date || stageData?.status || null;
  return calculateStageDate(stage, stageData, linkedDocument, documentFields, value, false) || null;
}

export function resolveEffectiveDate(
  task: any,
  stage: any,
  allDocuments: any[],
  kycDocuments: Map<string, any>,
  flag: "isEffectiveFrom" | "isEffectiveTo"
): string | null {
  const targetStage = stage || { id: WRITE_UP_STAGE_ID };
  const linkedDocument = getLinkedDocumentsForTaskStage(task, targetStage, allDocuments || [])?.[0] || null;
  if (!linkedDocument) return null;

  const documentFields = kycDocuments?.get(linkedDocument.document_id)?.fields || [];
  
  const targetFields = documentFields
    .filter((f: any) => f[flag] === true)
    .map((f: any) => f.fieldName || f.name || f.key)
    .filter(Boolean);

  if (targetFields.length === 0) return null;

  if (linkedDocument.extracted_details) {
    const d = findDateInObject(linkedDocument.extracted_details, targetFields);
    if (d) return d;
  }
  if (linkedDocument.extracted_data) {
    const d = findDateInObject(linkedDocument.extracted_data, targetFields);
    if (d) return d;
  }

  return null;
}

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

// Goes through the server-side /api/auth/users/company10 route (service-role client) rather
// than querying scanner_users directly with the anon client — that table's RLS has a
// self-referencing policy that throws "infinite recursion detected in policy for relation
// scanner_users" (Postgres 42P17) on any client-side anon query. The API route bypasses RLS
// entirely via the service-role key, same pattern the sibling registry app already uses.
export async function fetchBclUsers(): Promise<{ id: string; name: string }[]> {
  try {
    const res = await fetch("/api/auth/users/company10");
    const json = await res.json();
    if (!res.ok || !json?.success) {
      console.error("Error fetching BCL users:", json?.error || res.statusText);
      return [];
    }
    return (json.data || []).map((u: any) => ({
      id: u.id,
      name: u.displayName || u.id,
    }));
  } catch (error) {
    console.error("Error fetching BCL users:", error);
    return [];
  }
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
