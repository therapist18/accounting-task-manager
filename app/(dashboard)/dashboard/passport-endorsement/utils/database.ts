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

// One unified 5-way method for how a passport crosses the office threshold in either
// direction — replaces the old dispatch_method/delivery_type/pickup_relation combo (dispatch
// only) and the received side's plain brought_by_name free-text field.
export type HandlingMethod =
  | "client_self"
  | "client_representative"
  | "client_rider"
  | "bcl_rider"
  | "bcl_staff";

export interface HandlingMethodOption {
  value: HandlingMethod;
  receivedLabel: string;
  dispatchLabel: string;
  needsCourier: boolean;
  needsPersonName: boolean;
}

// Single source of truth for both the "how did it arrive" and "how is it getting back" pickers
// — same five options, direction-specific wording, and the flags each FormRow set needs to
// decide which extra fields to show (courier+rider fields, a plain person-name field, or
// neither — bcl_staff needs nothing extra since the existing staff-by picker already names
// which BCL staff member handled it).
export const HANDLING_METHOD_OPTIONS: HandlingMethodOption[] = [
  { value: "client_self", receivedLabel: "Client brought it in themselves", dispatchLabel: "Client picks it up themselves", needsCourier: false, needsPersonName: true },
  { value: "client_representative", receivedLabel: "Client sent someone they know", dispatchLabel: "Client sends someone they know", needsCourier: false, needsPersonName: true },
  { value: "client_rider", receivedLabel: "Client sent a rider/courier", dispatchLabel: "Client sends a rider/courier", needsCourier: true, needsPersonName: false },
  { value: "bcl_rider", receivedLabel: "BCL sent a rider/courier to fetch it", dispatchLabel: "BCL sends a rider/courier to deliver", needsCourier: true, needsPersonName: false },
  { value: "bcl_staff", receivedLabel: "BCL sent staff to fetch it", dispatchLabel: "BCL sends staff to deliver it", needsCourier: false, needsPersonName: false },
];

export function getHandlingMethodOption(method: HandlingMethod | null | undefined): HandlingMethodOption | undefined {
  return HANDLING_METHOD_OPTIONS.find((m) => m.value === method);
}

// Single "who actually did it" resolution for a method + its associated details — shared by
// page.tsx's sort values/export rows and HandlingTable's cells so all three always agree.
// For a rider/courier method, a 'company' courier (fixed office, e.g. G4S) shows by its own
// name (there's no specific person); an 'on_demand' one (Bolt/Uber-style) shows the individual
// rider's name since that's a different person each time.
export function resolveHandlingParty(
  method: HandlingMethod | null | undefined,
  opts: { staffName?: string | null; personName?: string | null; courier?: Courier | null | undefined; riderName?: string | null; clientName?: string | null }
): string {
  switch (method) {
    case "client_self":
      return opts.personName || opts.clientName || "Client";
    case "client_representative":
      return opts.personName || "Representative";
    case "client_rider":
    case "bcl_rider":
      if (opts.courier?.courier_type === "company") return opts.courier.name;
      return opts.riderName || opts.courier?.name || "Rider/Courier";
    case "bcl_staff":
      return opts.staffName || "BCL Staff";
    default:
      return "";
  }
}

// Composes the client-facing text for a "bcl_rider" dispatch — a company courier (fixed office,
// e.g. G4S/NTL) is a pickup notice; an on_demand one (Bolt/Uber-style, a different individual
// each time) is a delivery notice naming that rider. There's no send integration anywhere in
// this codebase (see SendRequirementsDialog's own clipboard-copy convention) — this only
// produces the text for staff to copy and paste into WhatsApp/SMS themselves.
export function composeDispatchMessage(courier: Courier | null | undefined, riderName: string | null | undefined): string | null {
  if (!courier) return null;
  if (courier.courier_type === "company") {
    return `We've dispatched your passport(s) — kindly pick them up from your nearest ${courier.name} office. Please ensure to carry the recipient's ID.`;
  }
  if (riderName) {
    return `${riderName} is delivering your passport(s) to you.`;
  }
  return null;
}

export interface PassportHandlingRecord {
  id: string;
  task_id: number;
  company_id: number | null;

  received_at: string | null;
  received_by: string | null; // BCL staff who logged the receipt
  received_method: HandlingMethod | null;
  received_person_name: string | null; // client_self / client_representative's name
  received_person_phone: string | null;
  received_courier_id: string | null; // client_rider / bcl_rider
  received_rider_name: string | null; // only when that courier is 'on_demand'
  received_rider_phone: string | null;
  received_tracking_ref: string | null;

  taken_at: string | null;
  taken_by: string | null;

  returned_at: string | null;
  returned_by: string | null;

  client_notified_at: string | null;
  client_notified_by: string | null;

  dispatched_at: string | null;
  dispatch_handled_by: string | null; // BCL staff point of contact for the dispatch
  dispatch_method: HandlingMethod | null;
  dispatch_person_name: string | null;
  dispatch_person_phone: string | null;
  dispatch_courier_id: string | null;
  dispatch_rider_name: string | null;
  dispatch_rider_phone: string | null;
  dispatch_tracking_ref: string | null;

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
  | "completed";

export const STEP_LABELS: Record<HandlingStep, string> = {
  mode_unset: "Mode Not Set",
  client_managed: "Client Managed",
  awaiting_receipt: "Awaiting Receipt",
  received: "Received — Not Yet Sent",
  at_nyayo: "At Nyayo House",
  stamped_back: "Stamped — Back In Office",
  ready_for_dispatch: "Ready For Dispatch",
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
  // dispatch_method and dispatched_at are always saved together in one step (see
  // HandlingWizardDialog's saveDispatch) — there's no real intermediate state between them.
  if (!record.dispatch_method || !record.dispatched_at) return "ready_for_dispatch";
  return "completed";
}

export async function fetchQualifyingTasks(
  companies: Map<number, { name: string; prefix: string }>
): Promise<Task[]> {
  // Pushes the status filter into the query (instead of fetching every immigration-department
  // task and discarding all but the ~2 qualifying statuses client-side) and skips fetchTasks'
  // per-task tm_class_requirements matching + reference-documents fetch — this page never reads
  // task.requirements/report_doc_defaults/referenceDocuments.
  const tasks = await fetchTasks(IMMIGRATION_DEPT_ID, undefined, companies, {
    statusFilter: QUALIFYING_STATUSES,
    includeRequirements: false,
  });
  return Array.isArray(tasks) ? tasks : [];
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
