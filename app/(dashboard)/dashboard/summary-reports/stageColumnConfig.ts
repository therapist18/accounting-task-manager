// Fixed milestone columns for the Summary Reports Dashboard. Each column is resolved
// directly off task.stages[stageId] (.date / .completedAt) — no per-department config,
// these stage ids are the same across departments (see DepartmentTasksManager's
// executePushCase, which stamps the same three ids as "completed" when bundling a case
// into a new department).
//
// Promised / Planned Execution / Actual Execution stage ids are placeholders — replace
// with the real stage ids once known.
export interface MilestoneStageColumn {
  key: string;
  dateLabel: string;
  timeLabel: string;
  stageId: string;
  highlight?: boolean;
}

export const MILESTONE_STAGE_COLUMNS: MilestoneStageColumn[] = [
  { key: 'registered', dateLabel: 'REG DATE', timeLabel: 'REG TIME', stageId: '1e6ebd85-db1e-4eb9-abb6-5fc145ac8caa' },
  { key: 'quotes_req_sent', dateLabel: 'QUOTES & REQ SENT DATE', timeLabel: 'QUOTES & REQ SENT TIME', stageId: '713bd644-f464-4f0f-9f02-7c422550b59d' },
  { key: 'confirmed', dateLabel: 'CONFIRMED DATE', timeLabel: 'CONFIRMED TIME', stageId: 'a19b270e-6d1e-4e6d-b2bc-f21db72cde08' },
  { key: 'promised', dateLabel: 'PROMISED DAYS', timeLabel: 'PROMISED TIME', stageId: 'TODO_REPLACE_PROMISED_STAGE_ID', highlight: true },
  { key: 'planned_execution', dateLabel: 'PLANNED EXECUTION DATE', timeLabel: 'PLANNED EXECUTION TIME', stageId: 'TODO_REPLACE_PLANNED_EXECUTION_STAGE_ID' },
  { key: 'actual_execution', dateLabel: 'ACTUAL EXECUTION DATE', timeLabel: 'ACTUAL EXECUTION TIME', stageId: 'TODO_REPLACE_ACTUAL_EXECUTION_STAGE_ID' },
];
