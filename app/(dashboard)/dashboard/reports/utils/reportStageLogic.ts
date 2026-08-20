// @ts-nocheck
// Shared "canonical current stage" / officer-perspective / client-perspective filtering
// logic, extracted from reports/page.tsx so it has a single implementation instead of
// being duplicated across report-style pages (e.g. summary-reports).
import { isValid, differenceInDays } from "date-fns";
import { calculateStageDate } from "../../tasks/utils/dateUtils";

export const parseDateSafe = (s: string | null | undefined): Date | null => {
  if (!s || typeof s !== 'string') return null;
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (m) {
    const [, dd, mm, yyyy, hh, min] = m;
    const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd), hh ? Number(hh) : 0, min ? Number(min) : 0);
    return isValid(d) ? d : null;
  }
  try {
    const d = new Date(s);
    return isValid(d) ? d : null;
  } catch { return null; }
};

export const isStageApplicableToTask = (stage: any, task: any, departments: any[]): boolean => {
  if (!task || !stage || !departments?.length) return true;
  try {
    // Utilize job_level if available to accurately determine N/A status
    const deptId = task.job_level?.department_id || task.department?.id || task.department_id;
    const subdeptId = task.job_level?.subdepartment_id || task.subdepartment?.id || task.subdepartment_id;
    const classId = task.job_level?.class_id || task.class_id;
    const subclassId = task.job_level?.subclass_id || task.subclass_id;

    const dept = departments.find(d => d.id === deptId);
    if (!dept) return true;

    const subdept = dept.tm_subdepartments?.find((s: any) => s.id === subdeptId);
    if (!subdept) return true;

    if (subclassId) {
      const cls = subdept.classes?.find((c: any) => c.id.toString() === classId?.toString());
      const subCls = cls?.subClasses?.find((sc: any) => sc.id.toString() === subclassId?.toString());
      const subClassStage = subCls?.stages?.find((s: any) => s.stage_id === stage.id);
      if (subClassStage && typeof subClassStage.applicable === 'boolean') return subClassStage.applicable;
    }

    if (classId) {
      const cls = subdept.classes?.find((c: any) => c.id.toString() === classId?.toString());
      const classStage = cls?.stages?.find((s: any) => s.stage_id === stage.id);
      if (classStage && typeof classStage.applicable === 'boolean') return classStage.applicable;
    }

    const subdeptStage = subdept.stages?.find((s: any) => s.stage_id === stage.id);
    if (subdeptStage && typeof subdeptStage.applicable === 'boolean') return subdeptStage.applicable;

    return true;
  } catch (error) {
    return true;
  }
};

// Rich "is this stage actually done" check — mirrors isStageCompleted inside
// getCurrentStageStatus (tasks/overall-view/tableUtils.tsx), which is what actually drives
// the visible "Current Stage Follow-Up" column.
export const isStageCompleted = (stage: any, task: any): boolean => {
  const stageData = task?.stages?.[stage?.id];
  if (!stageData) return false;
  const requiresDocuments = stage.documents?.length > 0;
  if (stageData.status === 'completed' || stageData.completedAt || (stageData.documents && Object.keys(stageData.documents).length > 0)) return true;
  if (!requiresDocuments && stageData.date) return true;
  if (requiresDocuments && stageData.documents) {
    const hasUploadedDocs = Object.values(stageData.documents).some((doc: any) => doc.status === 'uploaded' || doc.status === 'linked');
    if (hasUploadedDocs) return true;
  }
  return false;
};

// The task's single, real current stage — "highest completed index, then next applicable
// stage" algorithm. This is the one source of truth for "which follow_up bucket
// (officer/BCL/client) is this task in right now".
export const getCanonicalCurrentStage = (task: any, stages: any[], departments: any[]) => {
  const applicableStages = [...stages].filter(stage => isStageApplicableToTask(stage, task, departments)).sort((a, b) => (a.order_num || 0) - (b.order_num || 0));
  if (!applicableStages.length) return null;
  let highestCompletedIndex = -1;
  applicableStages.forEach((stage, i) => { if (isStageCompleted(stage, task)) highestCompletedIndex = i; });
  if (highestCompletedIndex === -1) return applicableStages[0];
  return applicableStages[highestCompletedIndex + 1] || applicableStages[highestCompletedIndex];
};

export const getCurrentOfficerStage = (task: any, stages: any[], departments: any[]) => {
  const current = getCanonicalCurrentStage(task, stages, departments);
  return current && current.follow_up?.toLowerCase() === 'officer' ? current : null;
};

export const getStageOfficerIds = (task: any, stages: any[], mode: 'current' | 'history' = 'current', departments: any[] = []) => {
  const normalizeIds = (ids: any) => Array.isArray(ids) ? ids.map(id => id?.toString()).filter(Boolean) : [];
  if (mode === 'current') {
    const currentOfficerStage = getCurrentOfficerStage(task, stages, departments);
    return normalizeIds(currentOfficerStage ? task?.stages?.[currentOfficerStage.id]?.officer_ids : []);
  }
  // 'history' = "handled at any point": every officer who was ever attached to any of this
  // task's officer-follow_up stages, regardless of whether that stage is completed.
  const officerIds = new Set<string>();
  stages.forEach((stage: any) => {
    if (stage.follow_up?.toLowerCase() !== 'officer') return;
    normalizeIds(task?.stages?.[stage.id]?.officer_ids).forEach(id => officerIds.add(id));
  });
  return Array.from(officerIds);
};

export const taskHasStageOfficer = (task: any, stages: any[], officerIds: string[], mode: 'current' | 'history', departments: any[] = []) => {
  if (!officerIds.length) return true;
  return getStageOfficerIds(task, stages, mode, departments).some(id => officerIds.includes(id));
};

export const isTaskWithClient = (task: any, stages: any[], departments: any[]) => {
  const current = getCanonicalCurrentStage(task, stages, departments);
  return current?.follow_up?.toString().toLowerCase() === 'client';
};

// Resolves the same "effective" date a stage_info cell displays on screen (document
// extraction date, completedAt fallback, or manual stage date via calculateStageDate),
// plus overdue status. Must NOT be gated on whether the report has "Docs" fields
// configured for the stage — otherwise calculateStageDate never sees a linkedDocument
// and falls back to stageData.date verbatim, which is sometimes garbage (e.g. literally
// "completed", written by a bug elsewhere in stage submission). Shared by the report cell
// renderer, the sort comparator, the export, and the total-time (Expected/Actual) columns.
export const computeStageDateInfo = (
  task: any,
  stage: any,
  col: any,
  deps: { stages: any[]; allDocuments: any[]; kycDocuments: Map<string, any> }
) => {
  const { stages, allDocuments, kycDocuments } = deps;
  const stageData = task.stages?.[col.stageId];
  const isSkipped = stageData?.status === 'skipped';
  const isCompleted = stageData?.status === 'completed' || stageData?.documentsUploaded === true;

  let docsForStage: any[] = [];
  const sourceDocRef = task.source_document_id?.[col.stageId];
  if (sourceDocRef) {
    const docIds = Array.isArray(sourceDocRef) ? sourceDocRef : [sourceDocRef];
    docsForStage = docIds.map((d: any) => {
      const docId = typeof d === 'string' ? d : d?.id;
      return allDocuments.find((ad: any) => ad.id?.toString() === docId?.toString());
    }).filter(Boolean);
  }
  if (docsForStage.length === 0 && stageData?.documents) {
    // stageData.documents holds lightweight link stubs ({id, name, status, ...}), not the
    // full document row, so resolve each stub's id against allDocuments to get the record
    // that actually carries extracted_details (falling back to the stub if not found).
    const stubs = typeof stageData.documents === 'object' ? Object.values(stageData.documents) : [];
    docsForStage = stubs
      .map((stub: any) => allDocuments.find((ad: any) => ad.id?.toString() === stub?.id?.toString()) || stub)
      .filter(Boolean);
  }

  const linkedDocument = docsForStage.length > 0 ? docsForStage[0] : null;
  const documentFields = linkedDocument?.document_type_id ? (kycDocuments.get(linkedDocument.document_type_id)?.fields || []) : [];

  const dateValue = !isSkipped ? calculateStageDate(stage, stageData, linkedDocument, documentFields, null, false) : null;

  const immigrationDateField = col.fields?.find((f: any) => f.isImmigrationDate);
  let immigrationDateValue: string | null = null;
  if (immigrationDateField && docsForStage.length > 0) {
    for (const doc of docsForStage) {
      const val = doc.extracted_details?.[immigrationDateField.fieldName] ||
        doc.edited_details?.[immigrationDateField.fieldName] ||
        doc.extracted_data?.[immigrationDateField.fieldName];
      if (val && typeof val === 'string' && val.trim()) {
        immigrationDateValue = val.trim();
        break;
      }
    }
  }

  const effectiveDateValue = dateValue || immigrationDateValue;

  let isOverdue = false;
  if (effectiveDateValue && stage.estimated_time) {
    const sortedStagesList = [...stages].sort((a, b) => (a.order_num || 0) - (b.order_num || 0));
    const currentStageIndex = sortedStagesList.findIndex(s => s.id === stage.id);

    let prevStage = currentStageIndex > 0 ? sortedStagesList[currentStageIndex - 1] : null;
    let prevDateStr = null;

    while (prevStage) {
      prevDateStr = task.stages?.[prevStage.id]?.date || task.stages?.[prevStage.id]?.completedAt || task.stages?.[prevStage.id]?.date_completed;
      if (prevDateStr) break;
      const prevIndex = sortedStagesList.findIndex(s => s.id === prevStage.id);
      if (prevIndex <= 0) break;
      prevStage = sortedStagesList[prevIndex - 1];
    }

    const startStr = prevDateStr || task.date_initiated || task.created_at;
    const start = parseDateSafe(startStr);
    const end = parseDateSafe(effectiveDateValue);

    if (start && end) {
      const durationMs = end.getTime() - start.getTime();
      const durationMinutes = Math.floor(durationMs / (1000 * 60));
      isOverdue = durationMinutes > stage.estimated_time;
    }
  }

  const isPending = !isCompleted && !isSkipped;

  return { stageData, isSkipped, isCompleted, isPending, docsForStage, linkedDocument, documentFields, dateValue, immigrationDateValue, effectiveDateValue, isOverdue };
};

// Lightweight "which date does this stage show" — task.stages[stageId].date/completedAt only,
// the same coarse lookup SummaryTable/DepartmentTasksManager already use for quick stage-date
// display elsewhere (not computeStageDateInfo's full document-field resolution above, which
// needs per-stage document/field data this Δ-column call site doesn't have on hand). Used by
// "Show Δ" in DepartmentTasksManager's EnhancedTable/StandardTable.
export const getSimpleStageDate = (task: any, stageId: string): Date | null => {
  const stageData = task?.stages?.[stageId];
  const raw = stageData?.date || stageData?.completedAt;
  return raw ? parseDateSafe(raw) : null;
};

// Day-gap between two stages' effective dates for a "Show Δ" column/row — walks back through
// `priorStages` (ordered, nearest-first) to find the nearest dated stage before `nextStage` if
// its immediate predecessor isn't dated yet. Same bridging behavior as
// reports/components/StandardReportView.tsx's Δ column and summary-reports/SummaryTable.tsx's
// milestone Δ column.
export const computeStageDeltaDays = (
  task: any,
  priorStages: any[],
  nextStage: any
): { days: number | null; bridgedFrom: any | null } => {
  const nextDate = getSimpleStageDate(task, nextStage.id);
  if (!nextDate) return { days: null, bridgedFrom: null };
  for (let i = priorStages.length - 1; i >= 0; i--) {
    const candidate = priorStages[i];
    const d = getSimpleStageDate(task, candidate.id);
    if (d) return { days: differenceInDays(nextDate, d), bridgedFrom: candidate };
  }
  return { days: null, bridgedFrom: null };
};
