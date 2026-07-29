import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase";
import { calculateStageDate } from "../../(dashboard)/dashboard/tasks/utils/dateUtils";

const REPORT_ID = "d0d23f1c-8073-46fa-9cef-681dc7ca2d44";

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

// Mirrors getCurrentStageTracking in the web Reports module: the applicable stage with the
// most recently "handled" (completed/skipped/dated) timestamp — used to decide whether a
// task is currently awaiting client follow-up (isTaskWithClient checks this stage's
// follow_up, not whichever stage is merely "next incomplete"). Searches the full department
// stage list rather than filtering by per-task applicability (isStageApplicableToTask) — same
// simplification already used for officer-stage resolution below, since this route doesn't
// fetch the nested subdepartment/class/subclass applicability overrides that function needs.
function getCurrentStageTracking(task: any, stages: any[]): { stage: any; handledAt: Date } | null {
  let latest: { stage: any; handledAt: Date } | null = null;
  for (const stage of stages) {
    const stageData = task?.stages?.[stage?.id];
    if (!stageData) continue;
    const directDate = parseDateSafe(
      stageData.completedAt || stageData.skippedAt || stageData.date_completed || stageData.date || stageData.lastUpdated || null
    );
    if (directDate && (!latest || directDate.getTime() > latest.handledAt.getTime())) {
      latest = { stage, handledAt: directDate };
    }
  }
  return latest;
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

export async function GET(req: NextRequest) {
  try {
    if (!isAuthorizedMobileRequest(req)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createServerSupabaseClient();
    const subDeptId = req.nextUrl.searchParams.get("subDeptId") || null;

    const { data: report, error: reportErr } = await supabase
      .from("tm_memorized_reports")
      .select("id, name, department_id, configuration")
      .eq("id", REPORT_ID)
      .single();

    if (reportErr || !report) {
      return NextResponse.json({ error: "Report not found" }, { status: 404 });
    }

    const deptId = report.department_id?.toString();
    if (!deptId) {
      return NextResponse.json({ error: "Report has no department" }, { status: 400 });
    }

    const { data: department } = await supabase
      .from("tm_departments")
      .select("id, name, stages, tm_subdepartments(id, name)")
      .eq("id", deptId)
      .single();

    const subDeptNameMap = new Map<string, string>();
    ((department as any)?.tm_subdepartments || []).forEach((s: any) =>
      subDeptNameMap.set(String(s.id), s.name || "")
    );

    // Officer/Manager tabs on the web Reports module aren't built from whoever happens to
    // have a task right now — they're the department's actual roster, sourced from
    // tm_role_assignments (see lib/shared-user-assignment-service.ts's getDepartmentUsers /
    // userService.getAllUserData), so a newly-assigned officer with zero current tasks
    // still shows up. Mirror that here instead of only surfacing officers/managers who
    // already appear in this department's tasks.
    const { data: roleAssignments } = await supabase
      .from("tm_role_assignments")
      .select("role, user_id, department_id")
      .eq("department_id", Number(deptId));
    const officerRosterIds = new Set<string>();
    const managerRosterIds = new Set<string>();
    (roleAssignments || []).forEach((a: any) => {
      if (a.role === "officer") officerRosterIds.add(String(a.user_id));
      if (a.role === "manager") managerRosterIds.add(String(a.user_id));
    });

    let taskQuery = supabase
      .from("tm_tasks")
      .select(`
        id, applicant_name, status, r_number, passport_number,
        date_initiated, department_id, subdepartment_id, class_id, subclass_id,
        job_level, stages, task_manager_id, task_assistant_id, officer_id,
        participants_details, renewal_status, individual_id, company_id,
        applicant_details, processing_requirements_documents, issuance_requirements_documents,
        source_document_id
      `)
      .eq("department_id", deptId)
      .order("created_at", { ascending: false });

    if (subDeptId) {
      taskQuery = taskQuery.eq("subdepartment_id", subDeptId);
    }

    const { data: tasks, error: tasksErr } = await taskQuery;
    if (tasksErr) throw tasksErr;

    // company_name is not a real tm_tasks column — it's join-computed everywhere else in
    // the web app (DepartmentTasksManager/reports fetchTasks) from the task's "sponsor"/
    // "company" participant, falling back to a company lookup table by id. Mirror that
    // here rather than trusting a column that doesn't exist in production.
    const { data: companyRows } = await supabase
      .from("acc_portal_company_duplicate")
      .select("id, company_name, company_prefix");
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

    // There is no standalone tm_stages table backing the live app — stagesdb.ts's
    // createStage/updateStage/deleteStage/updateStageOrder all read and write a `stages`
    // JSONB column directly on tm_departments. Querying a tm_stages table (as this route
    // did before) silently returned zero rows for every department, which is why officer
    // grouping and every named stage date resolved to nothing.
    const stages = ((department as any)?.stages || [])
      .slice()
      .sort((a: any, b: any) => (a.order_num || 0) - (b.order_num || 0));

    console.log(
      "[tasks-report] deptId=%s stages=%o",
      deptId,
      (stages || []).map((s: any) => ({ id: s.id, name: s.name, follow_up: s.follow_up }))
    );
    console.log(
      "[tasks-report] NAMED_STAGE_DATES lookup:",
      NAMED_STAGE_DATES.map(({ id, key }) => ({
        key,
        id,
        found: (stages || []).some((s: any) => s.id === id),
      }))
    );

    const { data: users } = await supabase
      .from("tm_users")
      .select("id, name");

    const usersMap = new Map<string, string>();
    (users || []).forEach((u: any) => usersMap.set(String(u.id), u.name || "Unknown"));

    // tm_role_assignments.user_id (the officer/manager roster) and stageData.officer_ids
    // reference the auth identity in scanner_users, which doesn't always have a matching
    // tm_users row — without this fallback, roster members resolved names as "Unknown"/
    // fell through to the "Unallocated" bucket even though they ARE a real, named officer.
    const { data: scannerUsers } = await supabase
      .from("scanner_users")
      .select("id, first_name, last_name, username");
    (scannerUsers || []).forEach((u: any) => {
      const key = String(u.id);
      if (usersMap.has(key)) return;
      const name = [u.first_name, u.last_name].filter(Boolean).join(" ").trim() || u.username || "";
      if (name) usersMap.set(key, name);
    });

    // Report Required Documents — the same defaults the web Reports module shows as
    // "report_doc" columns, aggregated across every job level in this department
    // (tm_class_requirements.report_doc_defaults), deduped by documentId.
    const { data: classRequirementRows } = await supabase
      .from("tm_class_requirements")
      .select("report_doc_defaults")
      .eq("job_level->>department_id", deptId);

    const reportDocDefaultsMap = new Map<string, any>();
    (classRequirementRows || []).forEach((row: any) => {
      (row.report_doc_defaults || []).forEach((d: any) => {
        if (d.isVisible === false) return;
        const key = String(d.documentId || d.id);
        if (!reportDocDefaultsMap.has(key)) reportDocDefaultsMap.set(key, d);
      });
    });
    const reportDocDefaults = Array.from(reportDocDefaultsMap.values())
      .sort((a: any, b: any) => (a.order || 0) - (b.order || 0));

    // KYC field config for every document type — needed both for the Report Required
    // Documents' isImmigrationDate lookup and for calculateStageDate's document-field
    // resolution below (a stage's linked document can be of any document type, not just
    // the ones configured as report_doc_defaults, so this must be unfiltered — mirrors
    // fetchAllKycFields() in the web app).
    const { data: kycDocs } = await supabase
      .from("acc_portal_kyc")
      .select("id, fields, name, display_name");
    const kycFieldsMap = new Map<string, any[]>();
    (kycDocs || []).forEach((k: any) => kycFieldsMap.set(String(k.id), k.fields || []));

    // All uploaded documents, unfiltered — needed to resolve a stage's linked document by
    // its own id (task.source_document_id / stageData.documents reference document row
    // ids directly, not director_id/company_id). Mirrors fetchAllDocuments() in the web
    // app, which is similarly unfiltered.
    const { data: allDocumentsRaw } = await supabase
      .from("acc_portal_directors_documents")
      .select("*");
    const allDocumentsById = new Map<string, any>();
    (allDocumentsRaw || []).forEach((d: any) => allDocumentsById.set(String(d.id), d));

    // Uploaded-document pools, scoped to the individuals/companies actually present among
    // this department's tasks (mirrors fetchUploadedDocumentsForTasks in the web app).
    const individualIds = new Set<number>();
    const companyIds = new Set<number>();
    (tasks || []).forEach((t: any) => {
      if (t.individual_id) individualIds.add(Number(t.individual_id));
      if (t.applicant_details?.id && t.applicant_details?.type !== "company") individualIds.add(Number(t.applicant_details.id));
      if (t.company_id) companyIds.add(Number(t.company_id));
      if (t.applicant_details?.id && t.applicant_details?.type === "company") companyIds.add(Number(t.applicant_details.id));
    });

    const [{ data: individualDocs }, { data: companyDocs }] = await Promise.all([
      individualIds.size > 0
        ? supabase.from("acc_portal_directors_documents").select("*").in("director_id", Array.from(individualIds))
        : Promise.resolve({ data: [] as any[] }),
      companyIds.size > 0
        ? supabase.from("acc_portal_kyc_uploads").select("*").in("company_id", Array.from(companyIds))
        : Promise.resolve({ data: [] as any[] }),
    ]);

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

    const activeStageIds = Object.keys(report.configuration?.stages || {});
    const applicableStages = (stages || [])
      .filter((s: any) => activeStageIds.includes(s.id))
      .sort((a: any, b: any) => (a.order_num || 0) - (b.order_num || 0));

    let loggedSample = false;

    const taskList = (tasks || []).map((task: any) => {
      let currentStageName = "";
      let currentStageFollowUp = "";

      if (!loggedSample) {
        loggedSample = true;
        console.log(
          "[tasks-report] sample task.stages for task id=%s: %s",
          task.id,
          JSON.stringify(task.stages).slice(0, 2000)
        );
      }

      for (const stage of applicableStages) {
        const stageData = task.stages?.[stage.id];
        if (!stageData) continue;
        const status = stageData.status?.toString().toLowerCase();
        if (status !== "completed" && status !== "skipped") {
          currentStageName = stage.name;
          currentStageFollowUp = stage.follow_up || "";
          break;
        }
      }

      if (!currentStageName && applicableStages.length > 0) {
        const last = applicableStages[applicableStages.length - 1];
        currentStageName = last.name;
        currentStageFollowUp = last.follow_up || "";
      }

      // Officer grouping mirrors getCurrentOfficerStage/getStageOfficerIds in the web
      // Reports module: only the stage currently awaiting an "officer" follow_up carries
      // an officer assignment — not just whichever stage happens to be in progress. A task
      // sitting on a "client"/"bcl" follow_up stage has no current officer and is correctly
      // Unallocated, but grouping by "first incomplete stage" (regardless of follow_up)
      // was picking up stages with no officer_ids at all, dumping nearly everything into
      // Unallocated.
      //
      // This must search the FULL department stage list (`stages`), not `applicableStages`
      // (which is narrowed to whichever stages this specific memorized report chose to
      // display as columns) — getCurrentOfficerStage on the web searches every stage in the
      // department regardless of report column config, and the "officer" follow_up stage is
      // frequently NOT one of the report's chosen display columns. Scoping to
      // applicableStages meant the officer stage was essentially never found, so nearly
      // every task fell into Unallocated.
      const currentOfficerStage = (stages || []).find((stage: any) => {
        const stageData = task.stages?.[stage.id];
        const status = stageData?.status?.toString().toLowerCase();
        return (
          stageData &&
          stage.follow_up?.toLowerCase() === "officer" &&
          status !== "completed" &&
          status !== "skipped"
        );
      });
      // Deliberately no fallback to tm_tasks.officer_id here: getStageOfficerIds on the web
      // Reports module has none either — a task with no current officer-follow_up stage is
      // Unallocated, full stop. A task can also carry MULTIPLE officer_ids on that stage, in
      // which case the web module counts it once per matching officer (see the grouping loop
      // below), not just the first id.
      const currentOfficerIds: string[] = currentOfficerStage
        ? (Array.isArray(task.stages?.[currentOfficerStage.id]?.officer_ids)
            ? task.stages[currentOfficerStage.id].officer_ids.map((id: any) => String(id)).filter(Boolean)
            : [])
        : [];

      // Mirrors isTaskWithClient in the web Reports module: a task is "awaiting client
      // response" when its most-recently-handled stage (not merely "next incomplete") has
      // follow_up === 'client'.
      const stageTracking = getCurrentStageTracking(task, stages || []);
      const awaitingClient = stageTracking?.stage?.follow_up?.toString().toLowerCase() === "client";

      // task_manager_id/task_assistant_id are not reliably populated columns — the real
      // assignment lives in participants_details, exactly as fetchTasks()/EnquiryDialog
      // derive it on the web side.
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
      const subDept =
        task.subdepartment_id ||
        task.job_level?.subdepartment_id ||
        "";
      const subDeptName = subDept ? subDeptNameMap.get(String(subDept)) || "" : "";
      const jl = task.job_level || {};
      const jobLevel = [jl.class_name, jl.subclass_name]
        .filter(Boolean)
        .join(" / ");

      const duration = task.date_initiated
        ? (() => {
            const start = new Date(task.date_initiated);
            const diff = Math.floor(
              (Date.now() - start.getTime()) / (1000 * 60 * 60 * 24)
            );
            return `${diff}d`;
          })()
        : "";

      const namedStageDates: Record<string, string | null> = {};
      NAMED_STAGE_DATES.forEach(({ id, key }) => {
        const stageDef = (stages || []).find((s: any) => s.id === id);
        namedStageDates[key] = stageDef
          ? resolveStageDisplayDate(task, stageDef, allDocumentsById, kycFieldsMap)
          : null;
      });

      return {
        id: task.id,
        applicant_name: task.applicant_name || "Unknown",
        company_name: resolveCompanyName(task) || "",
        sub_department: subDept,
        sub_department_name: subDeptName,
        status: task.status || "wip",
        job_level: jobLevel,
        r_number: task.r_number || "",
        passport_number: task.passport_number || "",
        duration,
        renewal_status: task.renewal_status || "New",
        current_stage_name: currentStageName,
        current_stage_follow_up: currentStageFollowUp,
        task_manager: taskManager,
        task_assistant: taskAssistant,
        required_documents: resolveRequiredDocuments(task),
        ...namedStageDates,
        _officerIds: currentOfficerIds,
        _managerId: taskManagerId,
        _awaitingClient: awaitingClient,
      };
    });

    console.log(
      "[tasks-report] tasks=%d withOfficerId=%d withManagerId=%d withAnyNamedDate=%d awaitingClient=%d",
      taskList.length,
      taskList.filter((t: any) => t._officerIds.length > 0).length,
      taskList.filter((t: any) => t._managerId).length,
      taskList.filter((t: any) => NAMED_STAGE_DATES.some(({ key }) => t[key])).length,
      taskList.filter((t: any) => t._awaitingClient).length
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
      // officer, not just the first. "Unallocated" means no current officer stage at all —
      // an id that just failed to resolve to a name is a data gap, not "unallocated", so it
      // must not be labeled the same way (that conflation was rendering as duplicate
      // "Unallocated" cards for two actually-different groups).
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

    // Mirrors the web Reports module's Client Follow-Up Report exactly: not grouped by
    // company/client name at all, just a single bucket of tasks currently awaiting a
    // 'client' follow_up stage (see _awaitingClient / getCurrentStageTracking above).
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

    console.log(
      "[tasks-report] officerRoster=%d managerRoster=%d byOfficer=%o byManager=%o",
      officerRosterIds.size,
      managerRosterIds.size,
      Array.from(officerMap.values()).map((g) => ({ id: g.id, name: g.name, count: g.count })),
      Array.from(managerMap.values()).map((g) => ({ id: g.id, name: g.name, count: g.count }))
    );

    const clean = (arr: any[]) =>
      arr.map(({ _officerIds, _managerId, _awaitingClient, ...rest }: any) => rest);

    const byClient = awaitingClientTasks.length > 0
      ? [{ clientName: "Tasks Awaiting Client Response", count: awaitingClientTasks.length, tasks: clean(awaitingClientTasks) }]
      : [];

    return NextResponse.json({
      report: { id: report.id, name: report.name },
      department: department ? { name: department.name } : null,
      // Full sub-unit roster for this department (not just sub-units that happen to have a
      // task in the current fetch) — mirrors activeSubDepartments in the web Reports module,
      // which reads straight off tm_departments.tm_subdepartments.
      subDepartments: Array.from(subDeptNameMap.entries()).map(([id, name]) => ({ id, name })),
      summary: {
        total: taskList.length,
        byOfficer: Array.from(officerMap.values()).map((g) => ({
          ...g,
          tasks: clean(g.tasks),
        })),
        byManager: Array.from(managerMap.values()).map((g) => ({
          ...g,
          tasks: clean(g.tasks),
        })),
        byClient,
      },
    });
  } catch (error) {
    console.error("GET /api/tasks-report:", error);
    return NextResponse.json(
      { error: "Failed to fetch tasks report" },
      { status: 500 }
    );
  }
}
