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

export const taskBundleService = {
  async fetchForJobLevel(jobLevel: BundleJobLevel): Promise<TaskBundleTemplate | null> {
    const normalized = normalizeJobLevel(jobLevel);
    if (!normalized?.department_id) return null;

    const { data, error } = await supabase
      .from("tm_task_bundles")
      .select("*")
      .contains("trigger_job_level", { department_id: normalized.department_id });

    if (error || !data?.length) return null;
    const exactMatch = data.find((bundle: any) => isSameJobLevel(bundle.trigger_job_level, normalized));
    return exactMatch ? ({ ...exactMatch, task_rules: exactMatch.task_rules || [] } as TaskBundleTemplate) : null;
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

export async function detectExistingWorkflowForIndividual(individualId: number) {
  const [workflowResult, taskResult] = await Promise.all([
    supabase
      .from("document_workflow_logs")
      .select("id, individual_id, document_type_id, uploaded_doc_id, action_type, payload, holds, comments, reminders, tasks, resolutions, created_at, updated_at")
      .eq("individual_id", individualId)
      .in("action_type", ["hold", "comment", "reminder_sent", "reminder_response", "task_pushed", "task_created", "resolution", "deactivation"])
      .order("updated_at", { ascending: false })
      .limit(200),
    supabase
      .from("tm_tasks")
      .select("id, status, job_description, individual_id, registry_metadata, created_at")
      .eq("individual_id", individualId)
      .order("created_at", { ascending: false })
      .limit(200),
  ]);

  const workflowLogs = workflowResult.data || [];
  const activeTasks = (taskResult.data || []).filter((task: any) =>
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

export async function detectTaskConflictsForJobLevel(individualId: number, jobLevel: BundleJobLevel) {
  const normalized = normalizeJobLevel(jobLevel);
  if (!normalized?.department_id) return [];

  const { data, error } = await supabase
    .from("tm_tasks")
    .select("id, status, job_description, job_level, individual_id, created_at, registry_metadata")
    .eq("individual_id", individualId)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    console.error("[detectTaskConflictsForJobLevel]", error);
    return [];
  }

  return (data || []).filter((task: any) => {
    if (!ACTIVE_TASK_STATUSES.has(String(task.status || "").toLowerCase())) return false;
    return isSameJobLevel(task.job_level, normalized);
  });
}
