// Column model for the Summary Reports Dashboard table. Centralized here so the table
// renderer, the column-visibility dialog, and the page's default visible-columns state
// all read from the same single source of truth.

// Stage lookup columns — resolved directly off task.stages[stageId] (.date / .completedAt).
// These stage ids are the same across departments (see DepartmentTasksManager's
// executePushCase, which stamps the same three ids as "completed" when bundling a case
// into a new department).
export interface MilestoneStageColumn {
  key: string;
  label: string;
  description: string;
  stageId: string;
  highlight?: boolean;
}

// The stage whose `date` (received) anchors Planned/Actual Execution below — "when the
// requirement was received" per the job-level Promised Time. Deliberately `date`, not
// `completedAt` — see getReqReceivedCompletedDateForTask in page.tsx.
export const REQ_RECEIVED_COMPLETED_STAGE_ID = '9ccdbfa6-8d76-49db-b8d4-09742c734905';

export const MILESTONE_STAGE_COLUMNS: MilestoneStageColumn[] = [
  { key: 'registered', label: 'ENQUIRY DATE', description: 'When the task was registered.', stageId: '1e6ebd85-db1e-4eb9-abb6-5fc145ac8caa' },
  { key: 'confirmed', label: 'CONFIRMED DATE', description: 'When the client confirmed the job.', stageId: 'a19b270e-6d1e-4e6d-b2bc-f21db72cde08' },
  { key: 'quotes_req_sent', label: 'Bill(Quote) Raised & Req. Checklist Sent', description: 'When quotes & requirements were sent to the client.', stageId: '713bd644-f464-4f0f-9f02-7c422550b59d' },
  { key: 'req_received_completed', label: 'REQ. RECEIVED & COMPLETED DATE', description: 'When the requirements were received.', stageId: REQ_RECEIVED_COMPLETED_STAGE_ID },
];

// Full ordered column list rendered by SummaryTable. `type` distinguishes how the value is
// resolved: 'field' → simple task/participant/enhanced-data lookup, 'milestone' → a
// MILESTONE_STAGE_COLUMNS entry, 'computed_time' → one of the derived time/date columns
// below, each resolved by its own getter in summary-reports/page.tsx:
//   - current_stage:        getCurrentStageNameForTask — the task's canonical current stage
//                            name (getCanonicalCurrentStageForTask), same "highest completed
//                            index, then next applicable stage" algorithm behind ReportsPage's
//                            "Current Stage Follow-Up" column (getCurrentStageStatus in
//                            tasks/overall-view/tableUtils.tsx) and this page's own
//                            Officers/Managers/Clients perspective tabs.
//   - promised_time:        getPromisedMinutesForTask — job-level Promised Time (Stages
//                            module), resolved against the task's own Application Type
//                            against any conditions set there, falling back to the default.
//   - planned_execution:    getPlannedExecutionDateForTask — REQ_RECEIVED_COMPLETED_STAGE_ID's
//                            date + Promised Time = target completion date.
//   - actual_execution:     getActualTimeInfoForTask — today − REQ_RECEIVED_COMPLETED_STAGE_ID's
//                            date, auto-counting elapsed time.
//   - execution_delta:      getActualTimeInfoForTask().deltaMinutes — Actual Execution minus
//                            Promised Time (positive = running over the promise).
//   - stages_time_expected: getExpectedMinutesForTask — sum of applicable stage.estimated_time
//                            (the Stages module's "Overall Expected Time"), purely informational.
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
  // Alongside the existing sub-department section grouping, not instead of it — these make
  // the hierarchy scannable per-row too (e.g. when sorted/filtered in a way that scatters
  // rows across groups). 'N/A' where a task doesn't go down to that level.
  { id: 'subdepartment', label: 'Sub-Department', type: 'field' },
  { id: 'class_name', label: 'Class', type: 'field' },
  { id: 'subclass_name', label: 'Sub-Class', type: 'field' },
  { id: 'job_description', label: 'Job Description', type: 'field', highlight: true },
  { id: 'current_stage', label: 'CURRENT STAGE', type: 'field' },
  ...MILESTONE_STAGE_COLUMNS.map((col): SummaryColumnDef => ({ id: col.key, label: col.label, type: 'milestone', highlight: col.highlight, milestone: col })),
  { id: 'promised_time', label: 'PROMISED TIME', type: 'computed_time', highlight: true },
  { id: 'planned_execution', label: 'PLANNED EXECUTION', type: 'computed_time' },
  { id: 'actual_execution', label: 'ACTUAL EXECUTION', type: 'computed_time' },
  { id: 'execution_delta', label: 'Δ VS PROMISED', type: 'computed_time' },
  { id: 'stages_time_expected', label: 'STAGES TIME EXPECTED', type: 'computed_time' },
];

export const DEFAULT_VISIBLE_SUMMARY_COLUMN_IDS = SUMMARY_COLUMNS
  .map(c => c.id)
  .filter(id => id !== 'company_prefix' && id !== 'sponsor_name');
