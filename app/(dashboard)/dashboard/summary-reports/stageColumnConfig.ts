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

// Order: Enquiry -> Bill(Quote) Raised & Req. Checklist Sent -> Req. Received & Completed ->
// Confirmed — the actual workflow sequence, not registration order.
export const MILESTONE_STAGE_COLUMNS: MilestoneStageColumn[] = [
  { key: 'registered', label: 'ENQUIRY DATE', description: 'When the task was registered.', stageId: '1e6ebd85-db1e-4eb9-abb6-5fc145ac8caa' },
  { key: 'quotes_req_sent', label: 'Bill(Quote) Raised & Req. Checklist Sent', description: 'When quotes & requirements were sent to the client.', stageId: '713bd644-f464-4f0f-9f02-7c422550b59d' },
  { key: 'req_received_completed', label: 'REQ. RECEIVED & COMPLETED DATE', description: 'When the requirements were received.', stageId: REQ_RECEIVED_COMPLETED_STAGE_ID },
  { key: 'confirmed', label: 'CONFIRMED DATE', description: 'When the client confirmed the job.', stageId: 'a19b270e-6d1e-4e6d-b2bc-f21db72cde08' },
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
  type: 'field' | 'milestone' | 'computed_time' | 'report_stage_info';
  highlight?: boolean;
  sticky?: boolean;
  primary?: boolean;
  milestone?: MilestoneStageColumn;
  // Set only on 'report_stage_info' columns — one combined column per non-milestone stage a
  // memorized report selected, bundling its completion date AND every document field selected
  // under it into a single cell. Mirrors reports/page.tsx's `stage_info` column type
  // (app/(dashboard)/dashboard/reports/page.tsx's `columns` builder + `stage_info` branch of
  // `renderCellValue`) rather than SummaryTable's old one-column-per-field approach — a report's
  // stage selections render as one column here exactly like they do on the Reports page.
  // `hasDate` is only ever true for a non-milestone stage; a milestone's date always renders via
  // its own static MILESTONE_STAGE_COLUMNS column, so a milestone stage only gets a
  // 'report_stage_info' column at all when the report also selected document fields under it —
  // in which case this column carries just those fields (hasDate: false).
  reportStageInfo?: {
    stageId: string;
    hasDate: boolean;
    fields: { kycId: string; fieldId: string; fieldName: string }[];
  };
}

// Column id for a dynamic report-selected stage's combined date+fields column — namespaced so
// it can never collide with a static SUMMARY_COLUMNS id or a milestone key.
export const reportStageInfoColumnId = (stageId: string): string => `report_stage_info_${stageId}`;

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
  { id: 'execution_delta', label: 'ACTUAL EXECUTION VS PROMISED', type: 'computed_time' },
  { id: 'stages_time_expected', label: 'STAGES TIME EXPECTED', type: 'computed_time' },
];

const DEFAULT_HIDDEN_SUMMARY_COLUMN_IDS = new Set([
  'company_prefix',
  'sponsor_name',
  'application_type',
  'duration',
  'subclass_name',
  'stages_time_expected',
]);

export const DEFAULT_VISIBLE_SUMMARY_COLUMN_IDS = SUMMARY_COLUMNS
  .map(c => c.id)
  .filter(id => !DEFAULT_HIDDEN_SUMMARY_COLUMN_IDS.has(id));

// Memorized Reports (tm_memorized_reports) are built against ENHANCED_TABLE_HEADERS_IMMIGRATION
// field ids — the vocabulary the /reports page's fully dynamic column builder uses — not
// against SUMMARY_COLUMNS ids. SummaryTable only understands SUMMARY_COLUMNS, so a report's
// configuration.taskFields can't be applied directly: it needs translating through this map.
// Only fields with a real SUMMARY_COLUMNS equivalent are listed; anything else (per-stage
// document fields, immigration-expiry columns, task manager/assistant, etc.) has no
// representation in the fixed Summary Reports column set yet and is dropped on Apply.
const TASK_FIELD_TO_SUMMARY_COLUMN_ID: Record<string, string> = {
  applicant_name: 'applicant',
  company_name: 'company',
  company_prefix: 'company_prefix',
  sub_department: 'subdepartment',
  job_level: 'class_name',
  duration: 'duration',
  job_description: 'job_description',
  current_stage_name: 'current_stage',
  current_stage_status_value: 'current_stage',
  // Identity mapping — ENHANCED_TABLE_HEADERS_IMMIGRATION uses the same ids as these
  // SUMMARY_COLUMNS computed_time entries on purpose (see that header list's own comment).
  promised_time: 'promised_time',
  planned_execution: 'planned_execution',
  actual_execution: 'actual_execution',
  execution_delta: 'execution_delta',
  stages_time_expected: 'stages_time_expected',
};

// Always kept visible regardless of what the applied report selected — without these two,
// rows in the resulting table can't be identified at all.
const ALWAYS_VISIBLE_SUMMARY_COLUMN_IDS = ['company', 'applicant'];

export interface ApplyReportToSummaryColumnsResult {
  visibleColumnIds: string[];
  matchedCount: number;
  droppedCount: number;
}

type ReportStageConfig = {
  isStageDateSelected?: boolean;
  documents?: Record<string, { fields?: { id: string }[] }>;
};

// Translates a memorized report's configuration into the subset of SUMMARY_COLUMNS ids
// SummaryTable can actually render: task fields via TASK_FIELD_TO_SUMMARY_COLUMN_ID, and
// per-stage selections (date and/or document fields) via MILESTONE_STAGE_COLUMNS or
// reportStageInfoColumnId. A stage counts as matched once, regardless of how many of
// date/fields it selected — one stage in the report becomes (at most) one column here, same as
// reports/page.tsx's one-`stage_info`-column-per-stage model. Only task fields with no
// SUMMARY_COLUMNS equivalent at all count as dropped; every stage selection now has a home via
// buildDynamicReportStageColumns.
export const applyReportToSummaryColumns = (configuration: {
  taskFields?: { id: string }[];
  stages?: Record<string, ReportStageConfig>;
}): ApplyReportToSummaryColumnsResult => {
  const mapped = new Set<string>(ALWAYS_VISIBLE_SUMMARY_COLUMN_IDS);
  let matchedCount = 0;
  let droppedCount = 0;

  (configuration.taskFields || []).forEach(field => {
    const summaryId = TASK_FIELD_TO_SUMMARY_COLUMN_ID[field.id];
    if (summaryId) { mapped.add(summaryId); matchedCount++; }
    else droppedCount++;
  });

  Object.entries(configuration.stages || {}).forEach(([stageId, stageConfig]) => {
    const hasDate = !!stageConfig?.isStageDateSelected;
    const hasFields = Object.values(stageConfig?.documents || {}).some(d => (d?.fields || []).length > 0);
    if (!hasDate && !hasFields) return;

    const milestone = MILESTONE_STAGE_COLUMNS.find(m => m.stageId === stageId);
    if (hasDate && milestone) mapped.add(milestone.key);
    if (hasFields || (hasDate && !milestone)) mapped.add(reportStageInfoColumnId(stageId));
    matchedCount++;
  });

  return {
    visibleColumnIds: [
      ...SUMMARY_COLUMNS.map(c => c.id).filter(id => mapped.has(id)),
      ...Array.from(mapped).filter(id => id.startsWith('report_stage_info_')),
    ],
    matchedCount,
    droppedCount,
  };
};

// Builds the SummaryColumnDef[] for a report's stage selections — the `dynamicStageColumns`
// SummaryTable merges alongside SUMMARY_COLUMNS. One combined column per stage (date + all its
// selected document fields together), mirroring reports/page.tsx's `stage_info` column exactly
// — see that file's `columns` useMemo. A milestone stage only gets one of these when the report
// also selected document fields under it (its date already has a static milestone column, so
// `hasDate` stays false to avoid a duplicate date). Stage/field names are looked up across
// every department's stage list and the passed-in kycDocuments map (stage ids are shared across
// departments the same way MILESTONE_STAGE_COLUMNS's are — see that constant's own comment), so
// this works regardless of which department(s) are currently loaded.
export const buildDynamicReportStageColumns = (
  configuration: { stages?: Record<string, ReportStageConfig> },
  stagesByDept: Map<string, any[]>,
  kycDocuments: Map<string, any> = new Map()
): SummaryColumnDef[] => {
  const allStages = Array.from(stagesByDept.values()).flat();
  // Same order the MemorizedReportDialog's own stage list uses — each department's stages
  // keep their DB fetch order (order_num), rather than whatever order they happen to appear
  // in configuration.stages (a JS object, ordered by whenever the user happened to select
  // each one while building the report).
  const columns: (SummaryColumnDef & { __orderNum: number })[] = [];

  Object.entries(configuration.stages || {}).forEach(([stageId, stageConfig]) => {
    const milestone = MILESTONE_STAGE_COLUMNS.find(m => m.stageId === stageId);
    const hasDate = !!stageConfig?.isStageDateSelected && !milestone;

    const fields: { kycId: string; fieldId: string; fieldName: string }[] = [];
    Object.entries(stageConfig?.documents || {}).forEach(([kycId, docConfig]) => {
      const kycDoc = kycDocuments.get(kycId);
      (docConfig?.fields || []).forEach(field => {
        const fieldInfo = kycDoc?.fields?.find((f: any) => f.id === field.id);
        fields.push({ kycId, fieldId: field.id, fieldName: fieldInfo?.fieldName || field.id });
      });
    });

    if (!hasDate && fields.length === 0) return;

    const stage = allStages.find((s: any) => s.id === stageId);
    const label = (stage?.name || 'Stage').toUpperCase();
    columns.push({
      id: reportStageInfoColumnId(stageId),
      label,
      type: 'report_stage_info',
      reportStageInfo: { stageId, hasDate, fields },
      __orderNum: stage?.order_num ?? Number.MAX_SAFE_INTEGER,
    });
  });

  columns.sort((a, b) => a.__orderNum - b.__orderNum);
  return columns.map(({ __orderNum, ...col }) => col);
};
