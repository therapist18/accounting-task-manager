// @ts-nocheck
import supabase from "@/lib/supabase/client";

export interface BundleJobLevel {
  level: number;
  department_id: number | null;
  subdepartment_id: number | null;
  class_id: number | null;
  subclass_id: number | null;
}

export interface BundleTaskTarget {
  type: "principal" | "dependant" | "dependant_all";
  ageFrom?: number;
  ageTo?: number;
}

export interface BundleTaskRule {
  id: string;
  job_type: string;
  label: string;
  related_document_type_id?: string | null;
  targets: BundleTaskTarget[];
  job_level: BundleJobLevel;
}

export interface TaskBundleTemplate {
  id: string;
  name: string;
  trigger_job_level: BundleJobLevel | null;
  trigger_document_type_id: string | null;
  task_rules: BundleTaskRule[];
}

export interface WorkflowRestrictionSummary {
  relatedDocumentTypeIds: string[];
  hasBlockingWorkflow: boolean;
  blockingReasons: string[];
  matchedDocumentTypes: string[];
  matchedEntries: Array<{
    documentTypeId: string;
    reason: string;
    action: string;
    date?: string;
    response?: string | null;
  }>;
}

export function formatWorkflowRestrictionReason(reason: string) {
  switch (String(reason || "").toLowerCase()) {
    case "active_hold":
      return "Active hold";
    case "pending_reminder":
      return "Pending reminder";
    case "reminder_response":
      return "Reminder response";
    case "task_pushed":
      return "Task pushed";
    case "task_created":
      return "Task created";
    case "not_involved_existing_workflow":
      return "Existing workflow on related document";
    case "resolution":
      return "Resolution";
    case "deactivation":
      return "Deactivation";
    default:
      return String(reason || "").replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
  }
}

const ACTIVE_TASK_STATUSES = new Set([
  "new",
  "pending",
  "enquiry",
  "in_progress",
  "on_hold",
  "hold",
]);

function normalizeJobLevel(jobLevel: Partial<BundleJobLevel> | null | undefined): BundleJobLevel | null {
  if (!jobLevel?.department_id) return null;
  return {
    level: Number(jobLevel.level ?? (jobLevel.subclass_id ? 4 : jobLevel.class_id ? 3 : jobLevel.subdepartment_id ? 2 : 1)),
    department_id: jobLevel.department_id ? Number(jobLevel.department_id) : null,
    subdepartment_id: jobLevel.subdepartment_id ? Number(jobLevel.subdepartment_id) : null,
    class_id: jobLevel.class_id ? Number(jobLevel.class_id) : null,
    subclass_id: jobLevel.subclass_id ? Number(jobLevel.subclass_id) : null,
  };
}

function isSameJobLevel(a: Partial<BundleJobLevel> | null | undefined, b: Partial<BundleJobLevel> | null | undefined) {
  const left = normalizeJobLevel(a);
  const right = normalizeJobLevel(b);
  if (!left || !right) return false;
  return left.level === right.level
    && left.department_id === right.department_id
    && left.subdepartment_id === right.subdepartment_id
    && left.class_id === right.class_id
    && left.subclass_id === right.subclass_id;
}

// tm_task_bundles is read in full-per-department by both fetchForJobLevel (one exact-match
// lookup) and DepartmentTasksManager's own "available bundles" listing — a short cache means
// both share one network round trip instead of each issuing their own identical
// `.contains("trigger_job_level", ...)` query for the same department.
const bundlesCache = new Map<number, { promise: Promise<any[]>; timestamp: number }>();
const BUNDLES_CACHE_MS = 30000;

async function fetchBundlesForDepartment(departmentId: number): Promise<any[]> {
  const now = Date.now();
  const cached = bundlesCache.get(departmentId);
  if (cached && now - cached.timestamp < BUNDLES_CACHE_MS) {
    return cached.promise;
  }
  const promise = supabase
    .from("tm_task_bundles")
    .select("*")
    .contains("trigger_job_level", { department_id: departmentId })
    .then(({ data, error }) => {
      if (error) {
        console.error("Error fetching task bundles:", error);
        return [];
      }
      return data || [];
    });
  bundlesCache.set(departmentId, { promise, timestamp: now });
  return promise;
}

export const taskBundleService = {
  async fetchForJobLevel(jobLevel: BundleJobLevel): Promise<TaskBundleTemplate | null> {
    const normalized = normalizeJobLevel(jobLevel);
    if (!normalized?.department_id) return null;

    const data = await fetchBundlesForDepartment(normalized.department_id);
    if (!data.length) return null;
    const exactMatch = data.find((bundle: any) => isSameJobLevel(bundle.trigger_job_level, normalized));
    return exactMatch ? ({ ...exactMatch, task_rules: exactMatch.task_rules || [] } as TaskBundleTemplate) : null;
  },

  fetchAllForDepartment(departmentId: number): Promise<any[]> {
    return fetchBundlesForDepartment(departmentId);
  },
};

const RESTRICTIVE_RESOLUTION_OUTCOMES = new Set([
  "renewed_by_client",
  "superseded",
  "status_changed",
  "deactivated",
  "no_action_required",
]);

function getWorkflowPayloadEntries(source: any, section: "holds" | "comments" | "reminders" | "tasks" | "resolutions") {
  if (Array.isArray(source?.[section])) return [...source[section]];

  const payload = source?.payload || source || {};
  const workflowState = payload?.workflow && typeof payload.workflow === "object" ? payload.workflow : payload || {};
  const entries = workflowState?.[section];
  if (Array.isArray(entries)) return [...entries];

  const legacyKeyMap: Record<string, string> = {
    holds: "hold",
    comments: "comment",
    reminders: "reminder",
    tasks: "task",
    resolutions: "resolution",
  };

  const legacyKey = legacyKeyMap[section];
  const legacyEntry =
    workflowState?.[legacyKey]
    ?? payload?.workflow?.[legacyKey]
    ?? payload?.[legacyKey];

  return legacyEntry ? [{ ...legacyEntry }] : [];
}

function getActiveTaskIds(taskEntry: any) {
  const allTaskIds = (taskEntry?.taskIds || []).map((taskId: any) => Number(taskId)).filter(Boolean);
  const cancelledTaskIds = new Set((taskEntry?.cancelledTaskIds || []).map((taskId: any) => Number(taskId)).filter(Boolean));
  const revertedTaskIds = new Set(
    (taskEntry?.revertActions?.flatMap((action: any) => action?.revertedTaskIds || []) || [])
      .map((taskId: any) => Number(taskId))
      .filter(Boolean)
  );
  return allTaskIds.filter((taskId: number) => !cancelledTaskIds.has(taskId) && !revertedTaskIds.has(taskId));
}

// Exact copy of bcl-registry's formatResolutionComment outcome labels
// (app/individuals/overall-document-manager/utils/workflowStatusLogic.ts) — kept word-for-word
// so this never tells a task creator something different from what the Document Manager
// itself shows for the same document. Not lowercased: bcl-registry matches resolution.outcome
// as stored, with no case normalization, so this doesn't either.
const RESOLUTION_OUTCOME_LABELS: Record<string, string> = {
  task_initiated: "Task Initiated",
  renewed_by_client: "Client renewed directly",
  bcl_renewed: "BCL renewed",
  renewed_unknown: "Renewed (party unknown)",
  superseded: "Superseded",
  updated: "Updated",
  status_changed: "Status Changed",
  deactivated: "Deactivated",
  no_action_required: "No Action Required",
};

// Exact copy of bcl-registry's RESP_LABEL (same file as above).
const REMINDER_RESPONSE_LABELS: Record<string, string> = {
  cancel: "REMINDER CANCELLED",
  task: "Push to Task",
  hold: "REMINDER HELD",
  renew: "REMINDER RENEWED",
};

// document_workflow_logs.action_type is NOT a reliable "what is this row" flag — it only
// records the *latest* stage a row was mutated through, and bcl-registry's own write path
// (getPersistedActionType) silently downgrades a fresh 'resolution' to 'comment' unless a
// fallback type is explicitly passed on write, so plenty of real rows sit at action_type:
// 'comment' despite actually holding resolution/hold/task data. Trusting action_type directly
// (as an earlier version of this file did) made almost everything read as "Has a comment".
// This instead inspects the actual holds/tasks/resolutions/reminders arrays, with the same
// priority order AND the same label text as bcl-registry's own getWorkflowStatusInfo: task >
// resolution > hold > reminder > comment. Task labels are the one place action_type is still
// trusted directly (task_created vs task_pushed) — same as bcl-registry does, since that
// downgrade issue is specific to resolutions, not tasks.
function summarizeWorkflowLogForDocument(log: any): string | null {
  const tasks = getWorkflowPayloadEntries(log, "tasks");
  const latestTask = tasks[tasks.length - 1];
  if (latestTask && !latestTask.dismissed) {
    const activeTaskIds = getActiveTaskIds(latestTask);
    if (activeTaskIds.length > 0) {
      const isPushedOnly = log.action_type === "task_pushed";
      if (isPushedOnly) return activeTaskIds.length === 1 ? "Task Pushed" : "Tasks Pushed";
      return activeTaskIds.length === 1 ? "Task Created" : "Tasks Created";
    }
    if (log.action_type === "task_pushed" && (!latestTask.taskIds || latestTask.taskIds.length === 0)) return "Task Pushed";
  }

  const resolutions = getWorkflowPayloadEntries(log, "resolutions");
  const latestResolution = resolutions[resolutions.length - 1];
  if (latestResolution && !latestResolution.dismissed && !latestResolution.corrected) {
    const outcome = String(latestResolution.outcome || "");
    return RESOLUTION_OUTCOME_LABELS[outcome] || outcome || "Resolved";
  }

  const holds = getWorkflowPayloadEntries(log, "holds");
  const latestHold = holds[holds.length - 1];
  if (latestHold && !latestHold.dismissed && latestHold.holdUntil && new Date(latestHold.holdUntil) > new Date()) {
    return `On Hold until ${new Date(latestHold.holdUntil).toLocaleDateString('en-GB')}`;
  }

  const reminders = getWorkflowPayloadEntries(log, "reminders");
  const latestReminder = reminders[reminders.length - 1];
  if (latestReminder && !latestReminder.dismissed) {
    if (latestReminder.response) {
      return REMINDER_RESPONSE_LABELS[latestReminder.response] || `REMINDER ${String(latestReminder.response).toUpperCase()}`;
    }
    return `Reminder Sent${latestReminder.channel ? ` via ${latestReminder.channel}` : ''}`;
  }

  const comments = getWorkflowPayloadEntries(log, "comments");
  const latestComment = comments[comments.length - 1];
  if (latestComment && !latestComment.dismissed) return "Comment";

  if (log.action_type === "deactivation") return "Deactivated";

  return null;
}

export function getBundleRelatedDocumentTypeIds(bundle?: TaskBundleTemplate | null) {
  if (!bundle) return [];
  return Array.from(new Set([
    ...(bundle.trigger_document_type_id ? [String(bundle.trigger_document_type_id)] : []),
    ...((bundle.task_rules || [])
      .map((rule: any) => rule.related_document_type_id ? String(rule.related_document_type_id) : null)
      .filter(Boolean)),
  ]));
}

export function evaluateWorkflowRestrictionsForBundle(workflowLogs: any[], bundle?: TaskBundleTemplate | null): WorkflowRestrictionSummary {
  const relatedDocumentTypeIds = getBundleRelatedDocumentTypeIds(bundle);
  if (!relatedDocumentTypeIds.length) {
    return {
      relatedDocumentTypeIds: [],
      hasBlockingWorkflow: false,
      blockingReasons: [],
      matchedDocumentTypes: [],
      matchedEntries: [],
    };
  }

  const matchedEntries: WorkflowRestrictionSummary["matchedEntries"] = [];
  const matchedDocumentTypes = new Set<string>();

  workflowLogs
    .filter((log: any) => log.document_type_id && relatedDocumentTypeIds.includes(String(log.document_type_id)))
    .forEach((log: any) => {
      const documentTypeId = String(log.document_type_id);
      const reminders = getWorkflowPayloadEntries(log, "reminders");
      const holds = getWorkflowPayloadEntries(log, "holds");
      const tasks = getWorkflowPayloadEntries(log, "tasks");
      const resolutions = getWorkflowPayloadEntries(log, "resolutions");

      const latestHold = holds[holds.length - 1];
      if (latestHold && !latestHold.dismissed && latestHold.holdUntil && new Date(latestHold.holdUntil) > new Date()) {
        matchedDocumentTypes.add(documentTypeId);
        matchedEntries.push({
          documentTypeId,
          reason: "active_hold",
          action: "hold",
          date: latestHold.holdUntil,
        });
      }

      const latestReminder = reminders[reminders.length - 1];
      if (latestReminder && !latestReminder.dismissed) {
        if (!latestReminder.response) {
          matchedDocumentTypes.add(documentTypeId);
          matchedEntries.push({
            documentTypeId,
            reason: "pending_reminder",
            action: log.action_type === 'reminder_sent' ? 'reminder_sent' : 'reminder_response', // Use actual action type
            date: latestReminder.sentAt || log.updated_at || log.created_at,
          });
        } else if (String(latestReminder.response).toLowerCase() !== "task") {
          matchedDocumentTypes.add(documentTypeId);
          matchedEntries.push({
            documentTypeId,
            reason: "reminder_response",
            action: "reminder_response",
            date: latestReminder.responseAt || log.updated_at || log.created_at,
            response: latestReminder.response,
          });
        }
      }

      const latestTask = tasks[tasks.length - 1];
      const hasLinkedCreatedTasks = getActiveTaskIds(latestTask).length > 0;
      if (
        latestTask &&
        !latestTask.dismissed &&
        (
          hasLinkedCreatedTasks ||
          (log.action_type === "task_pushed" && (!latestTask.taskIds || latestTask.taskIds.length === 0))
        )
      ) {
        matchedDocumentTypes.add(documentTypeId);
        matchedEntries.push({
          documentTypeId,
          reason: log.action_type === "task_created" ? "task_created" : "task_pushed",
          action: log.action_type === 'task_created' ? 'task_created' : 'task_pushed', // Use actual action type
          date: latestTask.createdAt || log.updated_at || log.created_at,
        });
      }

      const latestResolution = resolutions[resolutions.length - 1];
      if (
        latestResolution &&
        !latestResolution.dismissed &&
        !latestResolution.corrected &&
        RESTRICTIVE_RESOLUTION_OUTCOMES.has(String(latestResolution.outcome || "").toLowerCase())
      ) {
        matchedDocumentTypes.add(documentTypeId);
        matchedEntries.push({
          documentTypeId,
          reason: "resolution",
          action: "resolution",
          date: latestResolution.createdAt || log.updated_at || log.created_at,
        });
      }

      if (log.action_type === "deactivation") {
        matchedDocumentTypes.add(documentTypeId);
        matchedEntries.push({
          documentTypeId,
          reason: "deactivation",
          action: "deactivation",
          date: log.updated_at || log.created_at,
        });
      }
    });

  const blockingReasons = Array.from(new Set(matchedEntries.map((entry) => entry.reason)));

  return {
    relatedDocumentTypeIds,
    hasBlockingWorkflow: blockingReasons.length > 0,
    blockingReasons,
    matchedDocumentTypes: Array.from(matchedDocumentTypes),
    matchedEntries,
  };
}

// detectExistingWorkflowForIndividual and detectTaskConflictsForJobLevel both need this
// individual's tm_tasks rows (the latter just needs job_level on top) — EnquiryDialog fires
// both close together whenever an individual is selected with a department already chosen, so
// a short shared cache means they don't each issue their own identical `.eq("individual_id", ...)`
// query.
const individualTasksCache = new Map<number, { promise: Promise<any[]>; timestamp: number }>();
const INDIVIDUAL_TASKS_CACHE_MS = 10000;

function fetchTasksForIndividual(individualId: number): Promise<any[]> {
  const now = Date.now();
  const cached = individualTasksCache.get(individualId);
  if (cached && now - cached.timestamp < INDIVIDUAL_TASKS_CACHE_MS) {
    return cached.promise;
  }
  const promise = supabase
    .from("tm_tasks")
    .select("id, status, job_description, job_level, individual_id, registry_metadata, created_at")
    .eq("individual_id", individualId)
    .order("created_at", { ascending: false })
    .limit(200)
    .then(({ data, error }) => {
      if (error) {
        console.error("[fetchTasksForIndividual]", error);
        return [];
      }
      return data || [];
    });
  individualTasksCache.set(individualId, { promise, timestamp: now });
  return promise;
}

export async function detectExistingWorkflowForIndividual(individualId: number) {
  const [workflowResult, tasks] = await Promise.all([
    supabase
      .from("document_workflow_logs")
      .select("id, individual_id, document_type_id, uploaded_doc_id, action_type, payload, holds, comments, reminders, tasks, resolutions, created_at, updated_at")
      .eq("individual_id", individualId)
      .in("action_type", ["hold", "comment", "reminder_sent", "reminder_response", "task_pushed", "task_created", "resolution", "deactivation"])
      .order("updated_at", { ascending: false })
      .limit(200),
    fetchTasksForIndividual(individualId),
  ]);

  const workflowLogs = workflowResult.data || [];
  const activeTasks = tasks.filter((task: any) =>
    ACTIVE_TASK_STATUSES.has(String(task.status || "").toLowerCase())
  );

  const documentTypeSummary = new Map<string, { action: string; date: string; logId: number }>();
  workflowLogs.forEach((log: any) => {
    const documentTypeId = log.document_type_id ? String(log.document_type_id) : null;
    if (!documentTypeId || documentTypeSummary.has(documentTypeId)) return;
    documentTypeSummary.set(documentTypeId, {
      action: log.action_type,
      date: log.updated_at || log.created_at,
      logId: log.id,
    });
  });

  return {
    workflowLogs,
    activeTasks,
    hasExistingWorkflow: workflowLogs.length > 0,
    documentTypeSummary,
  };
}

export interface LinkableDocument {
  uploadedDocId: string;
  documentTypeId: string;
  documentTypeName: string;
  expiryDate: string | null;
  status: "expired" | "valid" | "unknown";
  // True for the one document this person's Current Immigration Status column in bcl-registry
  // is actually tracking — see pickCurrentImmigrationDocument below.
  isCurrentImmigrationStatus: boolean;
  // Label for whatever's already recorded in document_workflow_logs for this exact document,
  // if anything — so a task creator doesn't blindly stack a second task onto a document that's
  // already being handled. null means no workflow activity recorded yet.
  existingWorkflowLabel: string | null;
}

// Same ranking bcl-registry's imm-status-manager uses to decide a person's single "current"
// immigration document: prefer whichever of their Permanent/Temporary Immigration Status
// documents expires latest (a master-class document, if any, wins outright within its own
// category), then prefer Permanent over Temporary on a tie. Only the doc-manager's own field-
// level extraction of issue/expiry dates is skipped — this works off the plain expiry_date
// column instead, which is close enough for "which one should I suggest" purposes.
function pickCurrentImmigrationDocument(docs: any[], docTypesById: Map<string, any>): string | null {
  const withCategory = docs
    .map((doc) => ({ doc, docType: docTypesById.get(String(doc.document_id)) }))
    .filter((d) => d.docType);

  const rank = (list: typeof withCategory) => list.reduce((best, current) => {
    if (!best) return current;
    if (current.docType.is_master_class_imm_status && !best.docType.is_master_class_imm_status) return current;
    if (best.docType.is_master_class_imm_status && !current.docType.is_master_class_imm_status) return best;
    if (!current.doc.expiry_date) return best;
    if (!best.doc.expiry_date) return current;
    return new Date(current.doc.expiry_date) > new Date(best.doc.expiry_date) ? current : best;
  }, null as typeof withCategory[number] | null);

  const bestPermanent = rank(withCategory.filter((d) => d.docType.sub_main_category === "Permanent Immigration Status"));
  const bestTemporary = rank(withCategory.filter((d) => d.docType.sub_main_category === "Temporary Immigration Status"));

  if (bestPermanent && bestTemporary) {
    if (!bestPermanent.doc.expiry_date) return bestTemporary.doc.id;
    if (!bestTemporary.doc.expiry_date) return bestPermanent.doc.id;
    return new Date(bestTemporary.doc.expiry_date) > new Date(bestPermanent.doc.expiry_date)
      ? bestTemporary.doc.id
      : bestPermanent.doc.id;
  }
  return (bestPermanent || bestTemporary)?.doc.id ?? null;
}

// Lists a person's uploaded IMMIGRATION documents so a task creator can say "this task is
// about that document" — deliberately independent of detectExistingWorkflowForIndividual
// above, which only knows about documents that already HAVE a workflow log. This is the whole
// point: most of the time a task is created for a document that has never been tracked in
// document_workflow_logs at all (e.g. an expired permit nobody has actioned yet).
//
// acc_portal_directors_documents also holds non-identity paperwork generated by the task
// workflow itself (application forms, approval invoices, stage-upload artifacts) that isn't
// "a document this person has" in the sense this picker means — scoped to main_category =
// 'Immigration Status' (same category bcl-registry's imm-status-manager itself reads) to
// exclude that noise.
export async function fetchIndividualDocumentsForLinking(individualId: number): Promise<LinkableDocument[]> {
  const [{ data: docTypes, error: docTypesError }, { data: docs, error }, { data: workflowLogs, error: workflowError }] = await Promise.all([
    supabase
      .from("acc_portal_kyc")
      .select("id, display_name, sub_main_category, is_master_class_imm_status")
      .eq("main_category", "Immigration Status"),
    supabase
      .from("acc_portal_directors_documents")
      .select("id, document_id, expiry_date")
      .eq("director_id", individualId)
      .order("expiry_date", { ascending: true }),
    supabase
      .from("document_workflow_logs")
      .select("uploaded_doc_id, document_type_id, action_type, holds, comments, reminders, tasks, resolutions, payload")
      .eq("individual_id", individualId)
      .order("updated_at", { ascending: false }),
  ]);

  if (docTypesError) console.error("[fetchIndividualDocumentsForLinking] doc type lookup failed", docTypesError);
  if (error) { console.error("[fetchIndividualDocumentsForLinking]", error); return []; }
  if (workflowError) console.error("[fetchIndividualDocumentsForLinking] workflow lookup failed", workflowError);
  if (!docs?.length) return [];

  const docTypesById = new Map((docTypes || []).map((dt: any) => [String(dt.id), dt]));
  // Only documents whose type is actually an Immigration Status document — drops task-stage
  // admin artifacts that happen to share this same table.
  const immigrationDocs = docs.filter((doc: any) => docTypesById.has(String(doc.document_id)));
  if (!immigrationDocs.length) return [];

  const currentImmDocId = pickCurrentImmigrationDocument(immigrationDocs, docTypesById);

  // Fetched most-recently-updated first, so the first log seen per key here is the one that
  // actually matters (mirrors workflowService.findWorkflowRecord's own "latest wins" pick).
  const logByUploadedDoc = new Map<string, any>();
  const logByDocType = new Map<string, any>();
  (workflowLogs || []).forEach((log: any) => {
    if (log.uploaded_doc_id && !logByUploadedDoc.has(String(log.uploaded_doc_id))) logByUploadedDoc.set(String(log.uploaded_doc_id), log);
    if (log.document_type_id && !logByDocType.has(String(log.document_type_id))) logByDocType.set(String(log.document_type_id), log);
  });

  const now = new Date();
  const results: LinkableDocument[] = immigrationDocs.map((doc: any) => {
    const matchedLog = logByUploadedDoc.get(String(doc.id)) ?? logByDocType.get(String(doc.document_id)) ?? null;
    return {
      uploadedDocId: String(doc.id),
      documentTypeId: String(doc.document_id),
      documentTypeName: docTypesById.get(String(doc.document_id))?.display_name || "Document",
      expiryDate: doc.expiry_date || null,
      isCurrentImmigrationStatus: doc.id === currentImmDocId,
      status: doc.expiry_date ? (new Date(doc.expiry_date) < now ? "expired" : "valid") : "unknown",
      existingWorkflowLabel: matchedLog ? summarizeWorkflowLogForDocument(matchedLog) : null,
    };
  });

  // Current status first (the one most tasks are actually about), then whatever's soonest to
  // expire / most recently expired — matches the ascending expiry_date order already fetched.
  return results.sort((a, b) => {
    if (a.isCurrentImmigrationStatus !== b.isCurrentImmigrationStatus) return a.isCurrentImmigrationStatus ? -1 : 1;
    return 0;
  });
}

// Writes (or extends) the same document_workflow_logs row the Individual/Overall Document
// Manager's own "push to task" flow would have written — so a task created here shows up
// there with a normal "Task Created" workflow status, instead of the document sitting at
// "no workflow" forever because nobody remembered to go flag it on the other app. Both apps
// share one Supabase project, so this is a plain insert/update, not a cross-app API call.
// Matching precedence mirrors workflowService.findWorkflowRecord on the bcl-registry side:
// keyed by (individual_id, uploaded_doc_id) — the specific upload's own thread.
export async function linkTaskToDocumentWorkflow(params: {
  individualId: number;
  individualName: string;
  documentTypeId: string;
  documentTypeName: string;
  uploadedDocId: string;
  taskId: string | number;
  createdBy?: string | null;
}): Promise<{ success: boolean; error?: any }> {
  const { individualId, individualName, documentTypeId, documentTypeName, uploadedDocId, taskId, createdBy } = params;

  const { data: existing, error: findError } = await supabase
    .from("document_workflow_logs")
    .select("*")
    .eq("individual_id", individualId)
    .eq("uploaded_doc_id", uploadedDocId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (findError) {
    console.error("[linkTaskToDocumentWorkflow] lookup failed", findError);
    return { success: false, error: findError };
  }

  const nowIso = new Date().toISOString();
  const newTaskEntry = { taskIds: [taskId], createdAt: nowIso, actionType: "task_created" };

  if (existing) {
    // EnquiryDialog now calls this on every save (not just once at task creation), so a task
    // left linked to the same document across repeat edits would otherwise append a fresh,
    // identical `tasks` entry each time — skip the write once this taskId is already recorded.
    const alreadyLinked = (existing.tasks || []).some((t: any) => (t.taskIds || []).some((id: any) => String(id) === String(taskId)));
    if (alreadyLinked) return { success: true };

    const { error: updateError } = await supabase
      .from("document_workflow_logs")
      .update({
        action_type: "task_created",
        tasks: [...(existing.tasks || []), newTaskEntry],
        payload: {
          ...(existing.payload || {}),
          _meta: {
            ...(existing.payload?._meta || {}),
            individualName,
            documentName: documentTypeName,
          },
        },
        updated_at: nowIso,
        updated_by: createdBy ?? null,
      })
      .eq("id", existing.id);
    if (updateError) {
      console.error("[linkTaskToDocumentWorkflow] update failed", updateError);
      return { success: false, error: updateError };
    }
    return { success: true };
  }

  const { error: insertError } = await supabase.from("document_workflow_logs").insert({
    individual_id: individualId,
    document_type_id: documentTypeId,
    uploaded_doc_id: uploadedDocId,
    action_type: "task_created",
    holds: [],
    comments: [],
    reminders: [],
    resolutions: [],
    tasks: [newTaskEntry],
    payload: { _meta: { individualName, documentName: documentTypeName, documentStatus: "unknown" } },
    created_by: createdBy ?? null,
    created_at: nowIso,
    updated_at: nowIso,
  });
  if (insertError) {
    console.error("[linkTaskToDocumentWorkflow] insert failed", insertError);
    return { success: false, error: insertError };
  }
  return { success: true };
}

export async function detectTaskConflictsForJobLevel(individualId: number, jobLevel: BundleJobLevel) {
  const normalized = normalizeJobLevel(jobLevel);
  if (!normalized?.department_id) return [];

  const tasks = await fetchTasksForIndividual(individualId);

  return tasks.filter((task: any) => {
    if (!ACTIVE_TASK_STATUSES.has(String(task.status || "").toLowerCase())) return false;
    return isSameJobLevel(task.job_level, normalized);
  });
}
