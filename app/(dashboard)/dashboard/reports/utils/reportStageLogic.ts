// @ts-nocheck
// Shared "canonical current stage" / officer-perspective / client-perspective filtering
// logic, extracted from reports/page.tsx so it has a single implementation instead of
// being duplicated across report-style pages (e.g. summary-reports).
import { isValid } from "date-fns";

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
