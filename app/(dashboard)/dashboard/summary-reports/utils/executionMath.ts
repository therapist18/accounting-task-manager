// Promised/Planned/Actual Execution math — the single source of truth for these
// calculations, shared between Summary Reports Dashboard and Company Profiles (and any
// future page that lists tasks) so the same task never shows two different Promised Times,
// Planned/Actual Execution dates, or overdue statuses depending on which page you're on.
// Each page wraps these in its own useCallback (closing over its own promisedTimeByJobLevel/
// enhancedTasksData state) — see getPromisedTimeResolutionForTask etc. in page.tsx.
import { parseDateSafe } from "../../reports/utils/reportStageLogic";
import { REQ_RECEIVED_COMPLETED_STAGE_ID } from "../stageColumnConfig";

export type PromisedTimeEntry = { defaultMinutes: number | null; conditions: { value: string; minutes: number }[] };

export type PromisedTimeResolution = {
  minutes: number | null;
  source: 'condition' | 'default' | 'none';
  applicationType: string | null;
  matchedValue?: string;
};

export type ActualExecutionInfo = {
  diffDays: number;
  actualMinutes: number;
  promisedMinutes: number | null;
  deltaMinutes: number | null;
  isOverdue: boolean;
  exceededMinutes: number;
};

// Same shape everywhere a job level needs to be keyed by dept/subdept/class/subclass —
// deliberately NOT including `level`, so every task at the same job level (regardless of
// which specific stage set produced it) resolves to the same key.
export const buildJobLevelKey = (task: any, fallbackDeptId?: string) => {
  const jl = task.job_level || {};
  return JSON.stringify({
    department_id: Number(jl.department_id || task.department_id || fallbackDeptId),
    subdepartment_id: jl.subdepartment_id || null,
    class_id: jl.class_id || null,
    subclass_id: jl.subclass_id || null,
  });
};

// Same application_type resolution SummaryTable's "Application Type" column and export use —
// kept in sync deliberately, since a Promised Time condition is matched against exactly
// this value.
export const getApplicationTypeForTask = (task: any, enhancedTasksData?: Map<string, any>): string | null => {
  const enhancedTask = enhancedTasksData?.get(task.id?.toString()) || task;
  return enhancedTask.renewal_status || task.renewal_status || null;
};

// Full explanation of how a task's Promised Time was resolved — not just the number. Two
// tasks at the same job level can legitimately show different Promised Times (one matched a
// condition, the other fell to the default, or they matched different conditions); this is
// what lets a "why" tooltip explain the difference instead of it looking like a data error.
export const getPromisedTimeResolution = (
  task: any,
  promisedTimeByJobLevel: Map<string, PromisedTimeEntry>,
  enhancedTasksData?: Map<string, any>,
): PromisedTimeResolution => {
  const entry = promisedTimeByJobLevel.get(buildJobLevelKey(task));
  const applicationType = getApplicationTypeForTask(task, enhancedTasksData);
  if (!entry) return { minutes: null, source: 'none', applicationType };

  if (applicationType) {
    const match = entry.conditions.find((c) => c.value.toLowerCase() === String(applicationType).toLowerCase());
    if (match) return { minutes: match.minutes, source: 'condition', applicationType, matchedValue: match.value };
  }
  if (entry.defaultMinutes != null) return { minutes: entry.defaultMinutes, source: 'default', applicationType };
  return { minutes: null, source: 'none', applicationType };
};

// Anchor date for Planned/Actual Execution: when the requirement was received (REQ.
// RECEIVED & COMPLETED's `date`) — same field the milestone column itself displays, so
// what's driving these calculations always matches what's visible on screen. Falls back to
// `completedAt` only if `date` was never recorded for some reason.
export const getReqReceivedCompletedDate = (task: any): Date | null => {
  const stageData = task.stages?.[REQ_RECEIVED_COMPLETED_STAGE_ID];
  const raw = stageData?.date || stageData?.completedAt;
  return raw ? parseDateSafe(raw) : null;
};

// Planned Execution = the anchor date + Promised Time. Null until both the requirement has
// actually been received/confirmed AND a Promised Time is configured for this job level.
export const getPlannedExecutionDate = (anchor: Date | null, promisedMinutes: number | null): Date | null => {
  if (!anchor || !promisedMinutes) return null;
  return new Date(anchor.getTime() + promisedMinutes * 60 * 1000);
};

// Actual Execution — auto-counts live: today minus the anchor date. Null until the
// requirement has been received/confirmed. `deltaMinutes` (actual − promised) is the
// "Δ vs Promised" value; `isOverdue`/`exceededMinutes` are measured against Promised Time,
// not the stage-derived Expected Time — the client-facing commitment is what "overdue"
// means here, on every page that shows it.
export const getActualExecutionInfo = (anchor: Date | null, promisedMinutes: number | null): ActualExecutionInfo | null => {
  if (!anchor) return null;
  const diffDays = Math.max(0, Math.floor((Date.now() - anchor.getTime()) / (1000 * 60 * 60 * 24)));
  const actualMinutes = diffDays * 24 * 60;
  const deltaMinutes = promisedMinutes ? actualMinutes - promisedMinutes : null;
  const isOverdue = !!promisedMinutes && actualMinutes > promisedMinutes;
  return { diffDays, actualMinutes, promisedMinutes, deltaMinutes, isOverdue, exceededMinutes: isOverdue ? (deltaMinutes ?? 0) : 0 };
};
