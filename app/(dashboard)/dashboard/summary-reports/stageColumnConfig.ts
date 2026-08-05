// Column model for the Summary Reports Dashboard table. Centralized here so the table
// renderer, the column-visibility dialog, and the page's default visible-columns state
// all read from the same single source of truth.

// Stage lookup columns — resolved directly off task.stages[stageId] (.date / .completedAt).
// These stage ids are the same across departments (see DepartmentTasksManager's
// executePushCase, which stamps the same three ids as "completed" when bundling a case
// into a new department). Promised stage id is a placeholder — replace once known.
export interface MilestoneStageColumn {
  key: string;
  label: string;
  description: string;
  stageId: string;
  highlight?: boolean;
}

export const MILESTONE_STAGE_COLUMNS: MilestoneStageColumn[] = [
  { key: 'registered', label: 'REG DATE', description: 'When the task was registered.', stageId: '1e6ebd85-db1e-4eb9-abb6-5fc145ac8caa' },
  { key: 'quotes_req_sent', label: 'QUOTES & REQ SENT', description: 'When quotes & requirements were sent to the client.', stageId: '713bd644-f464-4f0f-9f02-7c422550b59d' },
  { key: 'confirmed', label: 'CONFIRMED', description: 'When the client confirmed the job.', stageId: 'a19b270e-6d1e-4e6d-b2bc-f21db72cde08' },
  { key: 'promised', label: 'PROMISED', description: 'The promised turnaround date given to the client.', stageId: 'TODO_REPLACE_PROMISED_STAGE_ID', highlight: true },
];

// Full ordered column list rendered by SummaryTable. `type` distinguishes how the value is
// resolved: 'field' → simple task/participant/enhanced-data lookup, 'milestone' → a
// MILESTONE_STAGE_COLUMNS entry, 'computed_time' → reuses ReportsPage's Expected Time /
// Actual Time Taken math (see getExpectedMinutesForTask / getActualTimeInfoForTask in
// summary-reports/page.tsx).
export interface SummaryColumnDef {
  id: string;
  label: string;
  type: 'field' | 'milestone' | 'computed_time';
  highlight?: boolean;
  sticky?: boolean;
  primary?: boolean;
  milestone?: MilestoneStageColumn;
}

export const SUMMARY_COLUMNS: SummaryColumnDef[] = [
  { id: 'company', label: 'Company Name', type: 'field', primary: true, sticky: true },
  { id: 'applicant', label: 'Applicant Name', type: 'field', primary: true, sticky: true },
  { id: 'company_prefix', label: 'Company Prefix', type: 'field' },
  { id: 'sponsor_name', label: 'Sponsor Name', type: 'field' },
  { id: 'application_type', label: 'Application Type', type: 'field' },
  { id: 'duration', label: 'Duration', type: 'field' },
  { id: 'job_description', label: 'Job Description', type: 'field', highlight: true },
  ...MILESTONE_STAGE_COLUMNS.map((col): SummaryColumnDef => ({ id: col.key, label: col.label, type: 'milestone', highlight: col.highlight, milestone: col })),
  { id: 'planned_execution', label: 'PLANNED EXECUTION', type: 'computed_time' },
  { id: 'actual_execution', label: 'ACTUAL EXECUTION', type: 'computed_time' },
];

export const DEFAULT_VISIBLE_SUMMARY_COLUMN_IDS = SUMMARY_COLUMNS.map(c => c.id);
