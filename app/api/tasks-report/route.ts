import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase";
import { calculateStageDate } from "../../(dashboard)/dashboard/tasks/utils/dateUtils";

// (The report used to be pinned to one memorized report, d0d23f1c-…, i.e. department 1; it is
// now chosen per request with ?departmentId=, defaulting to DEFAULT_DEPARTMENT_ID below.)

// Specific named-stage dates the mobile Officer Report surfaces per task, in addition to
// whichever stage is currently in progress (computed further down).
const NAMED_STAGE_DATES: { id: string; key: string }[] = [
  { id: "d59923c0-45ad-48be-aa26-211dea362372", key: "applied_date" },
  { id: "75b0a831-d0ad-4a51-b437-757aaead57da", key: "processing_fee_paid_date" },
  { id: "0381a733-a6de-46fe-8d29-5f9f407f17a2", key: "pro_payment_receipt_date" },
  { id: "aa6c99e0-914c-45ea-af31-1bb3fc1d7e81", key: "application_in_progress_date" },
  { id: "04c280a2-da2c-48b2-91a8-d3b1830ce3e9", key: "approved_date" },
];

function isValidDateString(s: any): boolean {
  if (!s || typeof s !== "string") return false;
  if (/^\d{2}\/\d{2}\/\d{4}(\s+\d{1,2}:\d{2})?$/.test(s)) return true;
  const d = new Date(s);
  return !isNaN(d.getTime());
}

function formatDisplayDate(raw: string): string {
  const m = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) return `${m[1]}/${m[2]}/${m[3]}`;
  const d = new Date(raw);
  if (isNaN(d.getTime())) return raw;
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}

// Resolves a stage's display date exactly the way DepartmentTasksManager/EditableStageCell
// and the web Reports module (computeStageDateInfo) do: resolve the stage's linked
// document (if any) and prefer whichever field on it is flagged as the "date" for that
// document type — via the same calculateStageDate() the web app uses — rather than
// trusting the stage's own `date`/`completedAt` fields at face value. Several stages have
// a long-standing bug where `date` ends up as the literal string "completed"; document
// resolution is what avoids surfacing that.
function resolveStageDisplayDate(
  task: any,
  stage: any,
  allDocumentsById: Map<string, any>,
  kycFieldsByDocType: Map<string, any[]>,
): string | null {
  const stageData = task.stages?.[stage.id];
  if (!stageData || stageData.status === "skipped") return null;

  let docsForStage: any[] = [];
  const sourceDocRef = task.source_document_id?.[stage.id];
  if (sourceDocRef) {
    const docIds = Array.isArray(sourceDocRef) ? sourceDocRef : [sourceDocRef];
    docsForStage = docIds
      .map((d: any) => (typeof d === "string" ? d : d?.id))
      .map((docId: any) => allDocumentsById.get(String(docId)))
      .filter(Boolean);
  }
  if (docsForStage.length === 0 && stageData.documents) {
    const stubs = typeof stageData.documents === "object" ? Object.values(stageData.documents) : [];
    docsForStage = stubs
      .map((stub: any) => allDocumentsById.get(String(stub?.id)) || stub)
      .filter(Boolean);
  }

  const linkedDocument = docsForStage.length > 0 ? docsForStage[0] : null;
  const documentFields = linkedDocument?.document_type_id
    ? (kycFieldsByDocType.get(String(linkedDocument.document_type_id)) || [])
    : [];

  const resolved = calculateStageDate(stage, stageData, linkedDocument, documentFields, null, false);
  if (isValidDateString(resolved)) return formatDisplayDate(resolved);

  // calculateStageDate's own "completed but no document" branch trusts stageData.date
  // verbatim, which is where the bogus "completed" string bug can still leak through —
  // guard against that here rather than trusting its return value blindly.
  if (isValidDateString(stageData.completedAt)) return formatDisplayDate(stageData.completedAt);
  if (isValidDateString(stageData.lastUpdated)) return formatDisplayDate(stageData.lastUpdated);
  return null;
}

function parseDateSafe(s: string | null | undefined): Date | null {
  if (!s || typeof s !== "string") return null;
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (m) {
    const [, dd, mm, yyyy, hh, min] = m;
    const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd), hh ? Number(hh) : 0, min ? Number(min) : 0);
    return isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

// Rich "is this stage actually done" check — mirrors isStageCompleted inside
// getCurrentStageStatus (tasks/overall-view/tableUtils.tsx), the function that actually
// drives the web Reports module's visible "Current Stage Follow-Up" column. The narrower
// check this route used before (literal stageData.status === "completed") let stages
// finished via a date/document, without ever getting an explicit 'completed' status
// written, keep counting as "current" long after the task had moved on.
function isStageCompleted(stage: any, task: any): boolean {
  const stageData = task?.stages?.[stage?.id];
  if (!stageData) return false;
  const requiresDocuments = stage.documents?.length > 0;
  if (stageData.status === "completed" || stageData.completedAt || (stageData.documents && Object.keys(stageData.documents).length > 0)) return true;
  if (!requiresDocuments && stageData.date) return true;
  if (requiresDocuments && stageData.documents) {
    const hasUploadedDocs = Object.values(stageData.documents).some(
      (doc: any) => doc.status === "uploaded" || doc.status === "linked"
    );
    if (hasUploadedDocs) return true;
  }
  return false;
}

// Mirrors isStageApplicableToTask in the web Reports module exactly: a stage can be marked
// not-applicable for a given job level at the subclass, class, or subdepartment level (most
// specific override wins), via the `stages` (StageAllocation[]) column carried on
// tm_subdepartments and on each entry of its `classes`/`subClasses` JSONB. Skipping this (as
// this route previously did) let a job-level-inapplicable stage still count toward "highest
// completed index", which could point getCanonicalCurrentStage at a different stage — and
// therefore a different officer/manager/client bucket — than the web dashboard for the same
// task.
function isStageApplicableToTask(task: any, stage: any, subDeptsById: Map<string, any>): boolean {
  try {
    const subdeptId = String(task.job_level?.subdepartment_id || task.subdepartment_id || "");
    const classId = task.job_level?.class_id ?? task.class_id;
    const subclassId = task.job_level?.subclass_id ?? task.subclass_id;

    const subdept = subDeptsById.get(subdeptId);
    if (!subdept) return true;

    if (subclassId) {
      const cls = (subdept.classes || []).find((c: any) => String(c.id) === String(classId));
      const subCls = cls?.subClasses?.find((sc: any) => String(sc.id) === String(subclassId));
      const subClassStage = subCls?.stages?.find((s: any) => s.stage_id === stage.id);
      if (subClassStage && typeof subClassStage.applicable === "boolean") return subClassStage.applicable;
    }

    if (classId) {
      const cls = (subdept.classes || []).find((c: any) => String(c.id) === String(classId));
      const classStage = cls?.stages?.find((s: any) => s.stage_id === stage.id);
      if (classStage && typeof classStage.applicable === "boolean") return classStage.applicable;
    }

    const subdeptStage = (subdept.stages || []).find((s: any) => s.stage_id === stage.id);
    if (subdeptStage && typeof subdeptStage.applicable === "boolean") return subdeptStage.applicable;

    return true;
  } catch {
    return true;
  }
}

// The task's single, real current stage — same "highest completed index, then next stage"
// algorithm as getCurrentStageStatus/the web Reports module's getCanonicalCurrentStage, so
// "current" means the same thing here as the visible Current Stage Follow-Up column. This
// is the one source of truth every "who does this task belong to right now" check (officer/
// manager/client) is derived from below, instead of three separate ad-hoc stage scans that
// could (and did) disagree with each other and with the displayed column. Filtered by
// isStageApplicableToTask first, same as the web Reports module's applicableStages.
function getCanonicalCurrentStage(task: any, stages: any[], subDeptsById: Map<string, any>): any | null {
  const applicableStages = stages.filter((stage: any) => isStageApplicableToTask(task, stage, subDeptsById));
  if (!applicableStages.length) return null;
  let highestCompletedIndex = -1;
  applicableStages.forEach((stage: any, i: number) => { if (isStageCompleted(stage, task)) highestCompletedIndex = i; });
  if (highestCompletedIndex === -1) return applicableStages[0];
  return applicableStages[highestCompletedIndex + 1] || applicableStages[highestCompletedIndex];
}

// This route is listed in PUBLIC_PATHS (middleware.ts) so it's reachable without the
// web app's session cookie — the BCL Meetings mobile app has no such cookie for this
// domain. In its place, require a shared secret the mobile app sends as a header. The
// route returns real applicant PII (names, R numbers, passport numbers), so it must not
// be reachable with no auth at all.
function isAuthorizedMobileRequest(req: NextRequest): boolean {
  const expected = process.env.TASKS_REPORT_API_KEY;
  if (!expected) {
    // Fail closed: an unset secret must never be treated as "no auth required".
    console.error("TASKS_REPORT_API_KEY is not configured — rejecting all requests to /api/tasks-report");
    return false;
  }
  const provided = req.headers.get("x-tasks-api-key");
  return provided === expected;
}

// Department shown when the caller doesn't ask for one (the Immigration department the mobile
// report was built for).
const DEFAULT_DEPARTMENT_ID = "1";

// Built reports are reused briefly per (department, sub-unit): opening the same department
// again, or several phones asking at once, doesn't rebuild the whole thing. Per server
// instance only — a cold start just rebuilds.
const REPORT_CACHE_TTL_MS = 60_000;
const reportCache = new Map<string, { at: number; payload: any }>();

/** PostgREST puts .in() lists in the URL, so long id lists are fetched in slices. */
async function selectIn(supabase: any, table: string, column: string, ids: Array<string | number>, columns = "*"): Promise<any[]> {
  const unique = Array.from(new Set(ids.map(String))).filter(Boolean);
  if (unique.length === 0) return [];
  const CHUNK = 200;
  const parts = await Promise.all(
    Array.from({ length: Math.ceil(unique.length / CHUNK) }, (_, i) =>
      supabase.from(table).select(columns).in(column, unique.slice(i * CHUNK, (i + 1) * CHUNK)),
    ),
  );
  return parts.flatMap((p: any) => {
    if (p.error) throw p.error;
    return p.data || [];
  });
}

export async function GET(req: NextRequest) {
  try {
    if (!isAuthorizedMobileRequest(req)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createServerSupabaseClient();

    // ?departments=1 → the department picker: every department with its task count.
    if (req.nextUrl.searchParams.get("departments")) {
      const [{ data: depts, error: deptErr }, { data: jobLevels }] = await Promise.all([
        supabase.from("tm_departments").select("id, name").order("id", { ascending: true }),
        supabase.from("tm_tasks").select("job_level"),
      ]);
      if (deptErr) throw deptErr;
      const counts = new Map<string, number>();
      (jobLevels || []).forEach((t: any) => {
        const d = String(t.job_level?.department_id ?? "");
        if (d) counts.set(d, (counts.get(d) || 0) + 1);
      });
      return NextResponse.json(
        {
          defaultDepartmentId: DEFAULT_DEPARTMENT_ID,
          departments: (depts || []).map((d: any) => ({ id: String(d.id), name: d.name || `Department ${d.id}`, taskCount: counts.get(String(d.id)) || 0 })),
        },
        { headers: { "Cache-Control": "private, max-age=300" } },
      );
    }

    const subDeptId = req.nextUrl.searchParams.get("subDeptId") || null;
    const deptId = req.nextUrl.searchParams.get("departmentId") || DEFAULT_DEPARTMENT_ID;

    const cacheKey = `${deptId}|${subDeptId ?? ""}`;
    const cached = reportCache.get(cacheKey);
    if (cached && Date.now() - cached.at < REPORT_CACHE_TTL_MS) {
      return NextResponse.json(cached.payload, { headers: { "Cache-Control": "private, max-age=60", "X-Report-Cache": "hit" } });
    }

    // Filtered by job_level->>department_id, NOT the raw department_id column — mirrors
    // fetchTasks() in taskManagerData.ts, which overwrites task.department_id from
    // task.job_level.department_id with no fallback to the raw column before the web Reports
    // module's deptScopedTasks filter ever runs. Some tasks have a NULL raw department_id
    // column but a populated job_level.department_id — filtering on the raw column silently
    // dropped them from the mobile report even though the web dashboard counts them.
    //
    // `select('*')`, never an explicit column list: this route used to name every column it
    // needed (id, applicant_name, …, task_manager_id, task_assistant_id, officer_id, …), and
    // PostgREST rejects the whole query when ANY named column is missing on the deployment —
    // 42703 "column tm_tasks.task_manager_id does not exist" → every department's report 500s.
    // fetchTasks() in taskManagerData.ts (and every dashboard page) just does .select('*') on
    // tm_tasks, so the dashboard keeps working while the mobile report broke. Ownership is
    // derived from participants_details below anyway (exactly as fetchTasks() does) — nothing
    // here ever read task_manager_id / task_assistant_id / officer_id.
    const buildTaskQuery = (): any => {
      let q = supabase
        .from("tm_tasks")
        .select("*")
        .eq("job_level->>department_id", deptId)
        .order("created_at", { ascending: false });
      if (subDeptId) {
        q = q.eq("job_level->>subdepartment_id", subDeptId);
      }
      return q;
    };

    // Everything below is independent, so it's fetched in one parallel round trip instead of
    // one query after another.
    const [
      { data: department },
      { data: roleAssignments },
      { data: tasks, error: tasksErr },
      { data: companyRows },
      { data: users },
      { data: scannerUsers },
      { data: classRequirementRows },
      { data: kycDocs },
    ] = await Promise.all([
      supabase.from("tm_departments").select("id, name, stages, tm_subdepartments(id, name, stages, classes)").eq("id", deptId).single(),
      // Officer/Manager tabs mirror the web Reports module: the department's actual roster
      // (tm_role_assignments), so an officer with zero current tasks still shows up.
      supabase.from("tm_role_assignments").select("role, user_id, department_id").eq("department_id", Number(deptId)),
      buildTaskQuery(),
      // company_name isn't a real tm_tasks column; it's resolved from participants / this table.
      supabase.from("acc_portal_company_duplicate").select("id, company_name, company_prefix"),
      supabase.from("tm_users").select("id, name"),
      // Roster ids / stage officer ids reference scanner_users, which doesn't always have a
      // tm_users row — used as a name fallback below.
      supabase.from("scanner_users").select("id, first_name, last_name, username"),
      // Report Required Documents defaults + expected time per job level for this department.
      supabase.from("tm_class_requirements").select("job_level, report_doc_defaults, expected_total_time_minutes").eq("job_level->>department_id", deptId),
      // KYC field config for every document type (a stage's linked document can be of any type).
      supabase.from("acc_portal_kyc").select("id, fields, name, display_name"),
    ]);
    if (tasksErr) throw tasksErr;
    if (!department) {
      return NextResponse.json({ error: "Department not found" }, { status: 404 });
    }
    const report = { id: `department-${deptId}`, name: (department as any).name || `Department ${deptId}` };

    const subDeptNameMap = new Map<string, string>();
    const subDeptsById = new Map<string, any>();
    ((department as any)?.tm_subdepartments || []).forEach((s: any) => {
      subDeptNameMap.set(String(s.id), s.name || "");
      subDeptsById.set(String(s.id), s);
    });

    const officerRosterIds = new Set<string>();
    const managerRosterIds = new Set<string>();
    (roleAssignments || []).forEach((a: any) => {
      if (a.role === "officer") officerRosterIds.add(String(a.user_id));
      if (a.role === "manager") managerRosterIds.add(String(a.user_id));
    });

    const companiesMap = new Map<number, { name: string; prefix: string }>();
    (companyRows || []).forEach((c: any) =>
      companiesMap.set(Number(c.id), { name: c.company_name || "", prefix: c.company_prefix || "" })
    );

    function resolveCompanyName(task: any): string {
      const companyParticipant = task.participants_details?.find(
        (p: any) => p.role?.includes("sponsor") || p.role?.includes("company")
      );
      return (
        companyParticipant?.name ||
        (companyParticipant?.id ? companiesMap.get(Number(companyParticipant.id))?.name : "") ||
        (task.company_id ? companiesMap.get(Number(task.company_id))?.name : "") ||
        ""
      );
    }

    function resolveCompanyPrefix(task: any): string {
      const companyParticipant = task.participants_details?.find(
        (p: any) => p.role?.includes("sponsor") || p.role?.includes("company")
      );
      return (
        (companyParticipant?.id ? companiesMap.get(Number(companyParticipant.id))?.prefix : "") ||
        (task.company_id ? companiesMap.get(Number(task.company_id))?.prefix : "") ||
        ""
      );
    }

    // Stages live in the `stages` JSONB column on tm_departments (there is no tm_stages table).
    const stages = ((department as any)?.stages || [])
      .slice()
      .sort((a: any, b: any) => (a.order_num || 0) - (b.order_num || 0));

    const usersMap = new Map<string, string>();
    (users || []).forEach((u: any) => usersMap.set(String(u.id), u.name || "Unknown"));
    (scannerUsers || []).forEach((u: any) => {
      const key = String(u.id);
      if (usersMap.has(key)) return;
      const name = [u.first_name, u.last_name].filter(Boolean).join(" ").trim() || u.username || "";
      if (name) usersMap.set(key, name);
    });

    const reportDocDefaultsMap = new Map<string, any>();
    // Mirrors expectedTimeByJobLevel in the web Reports module: keyed by the same canonical
    // {department_id, subdepartment_id, class_id, subclass_id} shape as each task's job_level.
    const expectedMinutesByJobLevelKey = new Map<string, number>();
    const jobLevelKey = (jl: any) => JSON.stringify({
      department_id: Number(jl?.department_id ?? deptId),
      subdepartment_id: jl?.subdepartment_id || null,
      class_id: jl?.class_id || null,
      subclass_id: jl?.subclass_id || null,
    });
    (classRequirementRows || []).forEach((row: any) => {
      (row.report_doc_defaults || []).forEach((d: any) => {
        if (d.isVisible === false) return;
        const key = String(d.documentId || d.id);
        if (!reportDocDefaultsMap.has(key)) reportDocDefaultsMap.set(key, d);
      });
      if (typeof row.expected_total_time_minutes === "number") {
        expectedMinutesByJobLevelKey.set(jobLevelKey(row.job_level), row.expected_total_time_minutes);
      }
    });
    const reportDocDefaults = Array.from(reportDocDefaultsMap.values())
      .sort((a: any, b: any) => (a.order || 0) - (b.order || 0));

    const kycFieldsMap = new Map<string, any[]>();
    (kycDocs || []).forEach((k: any) => kycFieldsMap.set(String(k.id), k.fields || []));

    // Only the documents these tasks actually link to (task.source_document_id and each stage's
    // stageData.documents stubs) — previously the WHOLE acc_portal_directors_documents table
    // was downloaded on every request just to look these few up.
    const linkedDocIds = new Set<string>();
    // Uploaded-document pools, scoped to the individuals / companies in this department's
    // tasks (mirrors fetchUploadedDocumentsForTasks in the web app).
    const individualIds = new Set<number>();
    const companyIds = new Set<number>();
    (tasks || []).forEach((t: any) => {
      Object.values(t.source_document_id || {}).forEach((ref: any) => {
        (Array.isArray(ref) ? ref : [ref]).forEach((d: any) => {
          const id = typeof d === "string" || typeof d === "number" ? d : d?.id;
          if (id != null) linkedDocIds.add(String(id));
        });
      });
      Object.values(t.stages || {}).forEach((sd: any) => {
        if (sd?.documents && typeof sd.documents === "object") {
          Object.values(sd.documents).forEach((stub: any) => { if (stub?.id != null) linkedDocIds.add(String(stub.id)); });
        }
      });
      if (t.individual_id) individualIds.add(Number(t.individual_id));
      if (t.applicant_details?.id && t.applicant_details?.type !== "company") individualIds.add(Number(t.applicant_details.id));
      if (t.company_id) companyIds.add(Number(t.company_id));
      if (t.applicant_details?.id && t.applicant_details?.type === "company") companyIds.add(Number(t.applicant_details.id));
    });

    const [linkedDocs, individualDocs, companyDocs] = await Promise.all([
      selectIn(supabase, "acc_portal_directors_documents", "id", Array.from(linkedDocIds)),
      selectIn(supabase, "acc_portal_directors_documents", "director_id", Array.from(individualIds)),
      selectIn(supabase, "acc_portal_kyc_uploads", "company_id", Array.from(companyIds)),
    ]);
    const allDocumentsById = new Map<string, any>();
    linkedDocs.forEach((d: any) => allDocumentsById.set(String(d.id), d));
    individualDocs.forEach((d: any) => allDocumentsById.set(String(d.id), d));

    const individualDocsMap = new Map<number, any[]>();
    (individualDocs || []).forEach((d: any) => {
      const id = Number(d.director_id);
      if (!individualDocsMap.has(id)) individualDocsMap.set(id, []);
      individualDocsMap.get(id)!.push(d);
    });
    const companyDocsMap = new Map<number, any[]>();
    (companyDocs || []).forEach((d: any) => {
      const id = Number(d.company_id);
      if (!companyDocsMap.has(id)) companyDocsMap.set(id, []);
      companyDocsMap.get(id)!.push(d);
    });

    function resolveRequiredDocuments(task: any) {
      return reportDocDefaults.map((docDef: any) => {
        const docId = docDef.documentId || docDef.id;
        let entityType = "principal";
        let entityId: any = null;
        if (docDef.docType === "company") {
          entityType = "company";
          entityId = task.company_id || task.applicant_details?.id;
        } else {
          entityId = task.individual_id || task.applicant_details?.id;
        }

        const snapshot = [
          ...(task.processing_requirements_documents || []),
          ...(task.issuance_requirements_documents || []),
        ];
        const entry = snapshot.find((s: any) =>
          s.documentTypeId === docId && s.entityType === entityType && Number(s.entityId) === Number(entityId)
        );

        const pool = entityType === "company" ? (companyDocsMap.get(Number(entityId)) || []) : (individualDocsMap.get(Number(entityId)) || []);
        const colRecords: any[] = entry
          ? pool.filter((d: any) => (entry.documentRecordIds || []).includes(d.id))
          : pool.filter((d: any) => d.document_id === docId);

        if (colRecords.length === 0) {
          return { document_name: docDef.documentName, uploaded: false, date: null };
        }

        const docRecord = colRecords[0];
        let date: string | null = null;
        const fields = kycFieldsMap.get(String(docId)) || [];
        const immigrationField = fields.find((f: any) => f.isImmigrationDate);
        if (immigrationField) {
          const fieldName = immigrationField.fieldName || immigrationField.name || immigrationField.id;
          const dateVal = docRecord.extracted_details?.[fieldName] ||
                          docRecord.extracted_data?.[fieldName] ||
                          docRecord.edited_details?.[fieldName];
          if (dateVal) date = formatDisplayDate(String(dateVal));
        }
        return { document_name: docDef.documentName, uploaded: true, date };
      });
    }

    let loggedSample = false;

    const taskList = (tasks || []).map((task: any) => {
      if (!loggedSample) {
        loggedSample = true;
        console.log(
          "[tasks-report] sample task.stages for task id=%s: %s",
          task.id,
          JSON.stringify(task.stages).slice(0, 2000)
        );
      }

      // Single canonical current stage for this task — see getCanonicalCurrentStage above.
      // current_stage_name/follow_up, officer ownership, and "awaiting client" all derive
      // from this ONE pointer rather than three separate scans, so they can't disagree with
      // each other (or with what the web Reports module's own Current Stage Follow-Up
      // column would show for the same task).
      const canonicalCurrentStage = getCanonicalCurrentStage(task, stages || [], subDeptsById);
      const currentStageName = canonicalCurrentStage?.name || "";
      const currentStageFollowUp = canonicalCurrentStage?.follow_up || "";

      // Scoped to tasks actually AT an officer stage right now — matches the web Reports
      // module exactly (isOfficerStage gate). A task currently on a BCL/Client stage is NOT
      // "Officer Unallocated" — it simply isn't part of the Officers breakdown at all right
      // now, same as byManager below is scoped to BCL. This replaces an earlier fallback to
      // tm_tasks.officer_id (the persisted "case officer" column) that recovered ownership
      // for tasks with no current officer stage — that fallback conflated "case owner on
      // file" with "who owns this right now", which is exactly what caused the mobile app to
      // show tasks under an officer AND a manager AND awaiting-client simultaneously, while
      // the web dashboard (which has no such fallback) only ever puts a task in one bucket.
      const isOfficerStage = canonicalCurrentStage?.follow_up?.toLowerCase() === "officer";
      const currentOfficerIds: string[] = isOfficerStage && Array.isArray(task.stages?.[canonicalCurrentStage.id]?.officer_ids)
        ? task.stages[canonicalCurrentStage.id].officer_ids.map((id: any) => String(id)).filter(Boolean)
        : [];

      // Mirrors isTaskWithClient in the web Reports module: a task is "awaiting client
      // response" when its canonical current stage's follow_up is 'client'.
      const awaitingClient = canonicalCurrentStage?.follow_up?.toString().toLowerCase() === "client";

      // Scoped to tasks AT a BCL stage right now — the manager's court, matching the web
      // Reports module's Managers perspective exactly.
      const isBCLStage = canonicalCurrentStage?.follow_up?.toLowerCase() === "bcl";

      // participants_details only — deliberately no fallback to the raw tm_tasks.task_manager_id
      // column, matching the web Reports module exactly (its task.task_manager is likewise
      // derived from participants_details alone; see fetchTasks() in taskManagerData.ts). A task
      // with task_manager_id set but no matching participants_details entry is "Unallocated"
      // here, same as it would be on the web dashboard.
      const taskManagerParticipant = task.participants_details?.find((p: any) =>
        p.role?.includes("task_manager")
      );
      const taskAssistantParticipant = task.participants_details?.find((p: any) =>
        p.role?.includes("task_assistant")
      );
      const taskManagerId = taskManagerParticipant?.id != null ? String(taskManagerParticipant.id) : "";
      const taskAssistantId = taskAssistantParticipant?.id != null ? String(taskAssistantParticipant.id) : "";
      const taskManager = taskManagerParticipant?.name || usersMap.get(taskManagerId) || "";
      const taskAssistant = taskAssistantParticipant?.name || usersMap.get(taskAssistantId) || "";
      // job_level first — matches fetchTasks()'s field priority on the web side (raw
      // subdepartment_id is only a fallback for tasks with no job_level.subdepartment_id).
      const subDept =
        task.job_level?.subdepartment_id ||
        task.subdepartment_id ||
        "";
      const subDeptName = subDept ? subDeptNameMap.get(String(subDept)) || "" : "";
      const jl = task.job_level || {};
      // job_level on tm_tasks only ever carries *_id fields (department_id, subdepartment_id,
      // class_id, subclass_id, level) — there is no class_name/subclass_name in the raw data,
      // so reading jl.class_name here always resolved to "" (confirmed against real rows).
      // The name has to be looked up from the department tree, the same subDeptsById map
      // isStageApplicableToTask uses, keyed by class_id inside that subdepartment's classes[].
      const subDeptForClass = subDeptsById.get(String(subDept));
      const classDef = jl.class_id
        ? subDeptForClass?.classes?.find((c: any) => String(c.id) === String(jl.class_id))
        : null;
      const subClassDef = jl.subclass_id
        ? classDef?.subClasses?.find((sc: any) => String(sc.id) === String(jl.subclass_id))
        : null;
      const className = classDef?.name || "";
      const jobLevel = [className, subClassDef?.name].filter(Boolean).join(" / ");

      const duration = task.date_initiated
        ? (() => {
            const start = new Date(task.date_initiated);
            const diff = Math.floor(
              (Date.now() - start.getTime()) / (1000 * 60 * 60 * 24)
            );
            return `${diff}d`;
          })()
        : "";

      // Mirrors total_time_actual/total_time_expected in the web Reports module: "actual"
      // is days elapsed since the task's first applicable stage (not date_initiated — the
      // first stage's own resolved date, same as computeStageDateInfo would show for it),
      // "expected" is tm_class_requirements.expected_total_time_minutes for the task's job
      // level, falling back to the sum of estimated_time across every applicable stage if
      // that class requirements row hasn't been set. Overdue when actual minutes exceed it.
      let actualDays: number | null = null;
      let expectedMinutes: number | null = null;
      let isOverdue = false;
      let exceededMinutes: number | null = null;
      const applicableStages = (stages || []).filter((s: any) => isStageApplicableToTask(task, s, subDeptsById));
      const firstStage = applicableStages[0];
      if (firstStage) {
        const firstStageDisplay = resolveStageDisplayDate(task, firstStage, allDocumentsById, kycFieldsMap);
        const firstStageDate = parseDateSafe(firstStageDisplay);
        if (firstStageDate) {
          actualDays = Math.floor((Date.now() - firstStageDate.getTime()) / (1000 * 60 * 60 * 24));
          const storedExpected = expectedMinutesByJobLevelKey.get(jobLevelKey(task.job_level));
          const resolvedExpectedMinutes: number = typeof storedExpected === "number"
            ? storedExpected
            : applicableStages.reduce((sum: number, s: any) => sum + (typeof s.estimated_time === "number" ? s.estimated_time : 0), 0);
          expectedMinutes = resolvedExpectedMinutes;
          const actualMinutes = actualDays * 24 * 60;
          if (resolvedExpectedMinutes > 0 && actualMinutes > resolvedExpectedMinutes) {
            isOverdue = true;
            exceededMinutes = actualMinutes - resolvedExpectedMinutes;
          }
        }
      }

      const namedStageDates: Record<string, string | null> = {};
      NAMED_STAGE_DATES.forEach(({ id, key }) => {
        const stageDef = (stages || []).find((s: any) => s.id === id);
        namedStageDates[key] = stageDef
          ? resolveStageDisplayDate(task, stageDef, allDocumentsById, kycFieldsMap)
          : null;
      });

      return {
        id: task.id,
        // applicant_details.name first, matching fetchTasks()'s priority on the web side —
        // every task with a blank raw applicant_name column found so far has its real name in
        // applicant_details.name instead (same NULL-raw-column-but-JSON-has-it pattern as the
        // department_id fix above), so this was surfacing "Unknown" for tasks that do have a
        // known applicant.
        applicant_name: task.applicant_details?.name || task.applicant_name || "Unknown",
        company_name: resolveCompanyName(task) || "",
        company_prefix: resolveCompanyPrefix(task) || "",
        sub_department: subDept,
        sub_department_name: subDeptName,
        status: task.status || "wip",
        job_level: jobLevel,
        class_name: className,
        r_number: task.r_number || "",
        passport_number: task.passport_number || "",
        duration,
        actual_days: actualDays,
        expected_minutes: expectedMinutes,
        is_overdue: isOverdue,
        exceeded_minutes: exceededMinutes,
        renewal_status: task.renewal_status || "New",
        job_description: task.job_description || "",
        nationality: task.nationality || task.applicant_details?.nationality || "",
        cancellation_reason: task.cancellation_details?.reason || "",
        cancellation_date: task.cancellation_details?.cancelled_at || null,
        current_stage_name: currentStageName,
        current_stage_follow_up: currentStageFollowUp,
        task_manager: taskManager,
        task_assistant: taskAssistant,
        required_documents: resolveRequiredDocuments(task),
        ...namedStageDates,
        _officerIds: currentOfficerIds,
        _isOfficerStage: isOfficerStage,
        _managerId: taskManagerId,
        _isBCLStage: isBCLStage,
        _awaitingClient: awaitingClient,
      };
    });

    console.log(
      "[tasks-report] tasks=%d isOfficerStage=%d withOfficerId=%d isBCLStage=%d withManagerId=%d withAnyNamedDate=%d awaitingClient=%d",
      taskList.length,
      taskList.filter((t: any) => t._isOfficerStage).length,
      taskList.filter((t: any) => t._officerIds.length > 0).length,
      taskList.filter((t: any) => t._isBCLStage).length,
      taskList.filter((t: any) => t._managerId).length,
      taskList.filter((t: any) => NAMED_STAGE_DATES.some(({ key }) => t[key])).length,
      taskList.filter((t: any) => t._awaitingClient).length
    );

    // A 97% isOfficerStage hit-rate is suspicious enough to check WHERE these tasks are
    // actually landing before trusting it — if they're all piling onto one specific stage
    // (rather than spread across the officer-heavy stretch of the pipeline), that points to
    // a stage-completion data gap for that one stage rather than a genuine backlog.
    const officerStageNameCounts: Record<string, number> = {};
    const officerStageStatusCounts: Record<string, number> = {};
    taskList.forEach((t: any) => {
      if (!t._isOfficerStage) return;
      officerStageNameCounts[t.current_stage_name] = (officerStageNameCounts[t.current_stage_name] || 0) + 1;
      officerStageStatusCounts[t.status] = (officerStageStatusCounts[t.status] || 0) + 1;
    });
    console.log(
      "[tasks-report] isOfficerStage breakdown by current_stage_name=%o by task.status=%o",
      officerStageNameCounts,
      officerStageStatusCounts
    );

    const officerMap = new Map<
      string,
      { id: string; name: string; count: number; tasks: any[] }
    >();
    const managerMap = new Map<
      string,
      { id: string; name: string; count: number; tasks: any[] }
    >();

    for (const t of taskList) {
      // Mirrors handleSendReport's officer grouping on the web: a task with multiple
      // officer_ids on its current officer-follow_up stage is counted once per matching
      // officer, not just the first. A task not currently AT an officer stage (_isOfficerStage
      // false) doesn't appear in byOfficer at all — "Unallocated" is reserved for tasks that
      // ARE at an officer stage right now with nobody assigned, not for tasks that are simply
      // elsewhere (BCL/Client) at the moment.
      if (t._isOfficerStage) {
        const officerIds: string[] = t._officerIds;
        if (officerIds.length === 0) {
          if (!officerMap.has("")) {
            officerMap.set("", { id: "", name: "Unallocated", count: 0, tasks: [] });
          }
          const og = officerMap.get("")!;
          og.count++;
          og.tasks.push(t);
        } else {
          for (const officerId of officerIds) {
            if (!officerMap.has(officerId)) {
              officerMap.set(officerId, {
                id: officerId,
                name: usersMap.get(officerId) || "Unknown",
                count: 0,
                tasks: [],
              });
            }
            const og = officerMap.get(officerId)!;
            og.count++;
            og.tasks.push(t);
          }
        }
      }

      // Same gate for managers: only tasks AT a BCL stage right now appear in byManager.
      if (t._isBCLStage) {
        const managerId = t._managerId || "";
        const managerName = managerId ? (t.task_manager || usersMap.get(managerId) || "Unknown") : "Unallocated";
        if (!managerMap.has(managerId)) {
          managerMap.set(managerId, {
            id: managerId,
            name: managerName,
            count: 0,
            tasks: [],
          });
        }
        const mg = managerMap.get(managerId)!;
        mg.count++;
        mg.tasks.push(t);
      }
    }

    // Mirrors the web Reports module's Client Follow-Up Report exactly: not grouped by
    // company/client name at all, just a single bucket of tasks currently awaiting a
    // 'client' follow_up stage (see _awaitingClient / getCanonicalCurrentStage above).
    const awaitingClientTasks = taskList.filter((t: any) => t._awaitingClient);

    // Add roster members with no current tasks as zero-count groups — matches the web
    // Reports module always listing the full department roster, not just whoever's busy
    // right now.
    officerRosterIds.forEach((id) => {
      if (!officerMap.has(id)) {
        officerMap.set(id, { id, name: usersMap.get(id) || "Unknown", count: 0, tasks: [] });
      }
    });
    managerRosterIds.forEach((id) => {
      if (!managerMap.has(id)) {
        managerMap.set(id, { id, name: usersMap.get(id) || "Unknown", count: 0, tasks: [] });
      }
    });

    const clean = (arr: any[]) =>
      arr.map(({ _officerIds, _isOfficerStage, _managerId, _isBCLStage, _awaitingClient, ...rest }: any) => rest);

    // "Tasks Handled" (byOfficerHandled) — mirrors officerFilterMode='history' on the web
    // Reports module: "handled at any point" — every officer ever attached to any of a
    // task's officer-follow_up stages, whether or not that stage is actually completed
    // (deliberately NOT gated on isStageCompleted; that distinction is what 'current'/
    // byOfficer is for). Officers are paid per task, not per stage, so a task only ever
    // contributes ONE credit to a given officer here even if they owned several of its
    // officer-stages. A single task CAN still generate credit for more than one officer
    // (e.g. JM owned stages 1-7, T owned 8-11) — each gets their own entry. handled_at is
    // the latest available stage date among that officer's stages on the task (null if
    // none of them have one yet), for sorting/period-filtering by pay run.
    const officerHandledMap = new Map<string, Map<number, { task: any; handledAt: Date | null }>>();
    (tasks || []).forEach((task: any) => {
      stages.forEach((stage: any) => {
        if (stage.follow_up?.toLowerCase() !== "officer") return;
        const stageData = task.stages?.[stage.id];
        const officerIds: string[] = Array.isArray(stageData?.officer_ids)
          ? stageData.officer_ids.map((id: any) => String(id)).filter(Boolean)
          : [];
        if (!officerIds.length) return;
        const completedAt = parseDateSafe(stageData.completedAt || stageData.date || stageData.date_completed || null);
        officerIds.forEach((officerId) => {
          if (!officerHandledMap.has(officerId)) officerHandledMap.set(officerId, new Map());
          const perTask = officerHandledMap.get(officerId)!;
          const existing = perTask.get(task.id);
          if (!existing || (completedAt && (!existing.handledAt || completedAt.getTime() > existing.handledAt.getTime()))) {
            perTask.set(task.id, { task, handledAt: completedAt });
          }
        });
      });
    });

    // Targeted diagnostic: independent of the officerHandledMap aggregation above, scan every
    // task's raw stages JSONB for this literal id string via JSON.stringify — a crude but
    // aggregation-logic-independent check for "does this id appear ANYWHERE in officer_ids
    // data at all, on any stage, completed or not, officer-follow_up or not". If this comes
    // back empty, the "0" is real data, not a bug in officerHandledMap. If it finds hits,
    // the bug is in how those hits get filtered/aggregated above.
    const DIAG_OFFICER_ID = "bc0bc88d-733a-4bf7-9910-85cb12e64231"; // Officer JM
    const rawHits: { taskId: number; stageId: string; stageName: string; stageFollowUp: any; officerIds: any }[] = [];
    (tasks || []).forEach((task: any) => {
      Object.entries(task.stages || {}).forEach(([stageId, stageData]: [string, any]) => {
        const ids = Array.isArray(stageData?.officer_ids) ? stageData.officer_ids.map((x: any) => String(x)) : [];
        if (ids.includes(DIAG_OFFICER_ID)) {
          const stageDef = stages.find((s: any) => s.id === stageId);
          rawHits.push({ taskId: task.id, stageId, stageName: stageDef?.name || "(unknown stage)", stageFollowUp: stageDef?.follow_up, officerIds: stageData.officer_ids });
        }
      });
    });
    console.log("[tasks-report] DIAG raw officer_ids hits for %s: count=%d %o", DIAG_OFFICER_ID, rawHits.length, rawHits);

    const taskListById = new Map<number, any>(taskList.map((t: any) => [t.id, t]));
    const officerHandledGroups = new Map<string, { id: string; name: string; count: number; tasks: any[] }>();
    officerRosterIds.forEach((id) => {
      officerHandledGroups.set(id, { id, name: usersMap.get(id) || "Unknown", count: 0, tasks: [] });
    });
    officerHandledMap.forEach((perTask, officerId) => {
      if (!officerHandledGroups.has(officerId)) {
        officerHandledGroups.set(officerId, { id: officerId, name: usersMap.get(officerId) || "Unknown", count: 0, tasks: [] });
      }
      const group = officerHandledGroups.get(officerId)!;
      perTask.forEach(({ task, handledAt }) => {
        const rawTask = taskListById.get(task.id);
        if (!rawTask) return;
        group.count++;
        group.tasks.push({ ...clean([rawTask])[0], handled_at: handledAt ? formatDisplayDate(handledAt.toISOString()) : null });
      });
    });

    console.log(
      "[tasks-report] officerRoster=%d managerRoster=%d byOfficer=%o byManager=%o byOfficerHandled=%o",
      officerRosterIds.size,
      managerRosterIds.size,
      Array.from(officerMap.values()).map((g) => ({ id: g.id, name: g.name, count: g.count })),
      Array.from(managerMap.values()).map((g) => ({ id: g.id, name: g.name, count: g.count })),
      Array.from(officerHandledGroups.values()).map((g) => ({ id: g.id, name: g.name, count: g.count }))
    );

    const byClient = awaitingClientTasks.length > 0
      ? [{ clientName: "Tasks Awaiting Client Response", count: awaitingClientTasks.length, tasks: clean(awaitingClientTasks) }]
      : [];

    const payload = {
      report: { id: report.id, name: report.name },
      department: department ? { name: department.name } : null,
      // Full sub-unit roster for this department (not just sub-units that happen to have a
      // task in the current fetch) — mirrors activeSubDepartments in the web Reports module,
      // which reads straight off tm_departments.tm_subdepartments.
      subDepartments: Array.from(subDeptNameMap.entries()).map(([id, name]) => ({ id, name })),
      summary: {
        total: taskList.length,
        // "Current basket" — what each officer/manager owns right now (see
        // getCanonicalCurrentStage above).
        byOfficer: Array.from(officerMap.values()).map((g) => ({
          ...g,
          tasks: clean(g.tasks),
        })),
        byManager: Array.from(managerMap.values()).map((g) => ({
          ...g,
          tasks: clean(g.tasks),
        })),
        byClient,
        // "Tasks Handled" — payroll basis: one credit per (officer, task) for completed
        // officer-stage ownership, dated by handled_at on each task entry. Additive field;
        // byOfficer/byManager/byClient are unchanged for existing consumers.
        byOfficerHandled: Array.from(officerHandledGroups.values()),
      },
    };
    reportCache.set(cacheKey, { at: Date.now(), payload });
    return NextResponse.json(payload, { headers: { "Cache-Control": "private, max-age=60" } });
  } catch (error) {
    console.error("GET /api/tasks-report:", error);
    return NextResponse.json(
      { error: "Failed to fetch tasks report" },
      { status: 500 }
    );
  }
}
