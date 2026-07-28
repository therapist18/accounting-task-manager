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

export async function GET(req: NextRequest) {
  try {
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
      .select("id, name")
      .eq("id", deptId)
      .single();

    let taskQuery = supabase
      .from("tm_tasks")
      .select(`
        id, applicant_name, company_name, status, r_number, passport_number,
        date_initiated, department_id, subdepartment_id, class_id, subclass_id,
        job_level, stages, task_manager_id, task_assistant_id,
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

    const { data: stages } = await supabase
      .from("tm_stages")
      .select("id, name, order_num, follow_up, estimated_time")
      .eq("department_id", deptId)
      .order("order_num", { ascending: true });

    const { data: users } = await supabase
      .from("tm_users")
      .select("id, name");

    const usersMap = new Map<string, string>();
    (users || []).forEach((u: any) => usersMap.set(u.id, u.name || "Unknown"));

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

    const taskList = (tasks || []).map((task: any) => {
      let currentStageName = "";
      let currentStageFollowUp = "";
      let currentOfficerId = "";

      for (const stage of applicableStages) {
        const stageData = task.stages?.[stage.id];
        if (!stageData) continue;
        const status = stageData.status?.toString().toLowerCase();
        if (status !== "completed" && status !== "skipped") {
          currentStageName = stage.name;
          currentStageFollowUp = stage.follow_up || "";
          const officerIds = Array.isArray(stageData.officer_ids)
            ? stageData.officer_ids
            : [];
          if (officerIds.length > 0) currentOfficerId = officerIds[0].toString();
          break;
        }
      }

      if (!currentStageName && applicableStages.length > 0) {
        const last = applicableStages[applicableStages.length - 1];
        currentStageName = last.name;
        currentStageFollowUp = last.follow_up || "";
        const lastData = task.stages?.[last.id];
        const officerIds = Array.isArray(lastData?.officer_ids)
          ? lastData.officer_ids
          : [];
        if (officerIds.length > 0) currentOfficerId = officerIds[0].toString();
      }

      const taskManager = usersMap.get(task.task_manager_id) || "";
      const taskAssistant = usersMap.get(task.task_assistant_id) || "";
      const subDept =
        task.subdepartment_id ||
        task.job_level?.subdepartment_id ||
        "";
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
        company_name: task.company_name || "",
        sub_department: subDept,
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
        _officerId: currentOfficerId,
      };
    });

    const officerMap = new Map<
      string,
      { id: string; name: string; count: number; tasks: any[] }
    >();
    const managerMap = new Map<
      string,
      { id: string; name: string; count: number; tasks: any[] }
    >();
    const clientMap = new Map<
      string,
      { clientName: string; count: number; tasks: any[] }
    >();

    for (const t of taskList) {
      const officerId = t._officerId;
      const officerName = usersMap.get(officerId) || "Unallocated";
      if (!officerMap.has(officerId)) {
        officerMap.set(officerId, {
          id: officerId,
          name: officerName,
          count: 0,
          tasks: [],
        });
      }
      const og = officerMap.get(officerId)!;
      og.count++;
      og.tasks.push(t);

      const rawTask = (tasks || []).find((raw: any) => raw.id === t.id);
      const managerId = rawTask?.task_manager_id || "";
      const managerName = usersMap.get(managerId) || "Unallocated";
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

      const clientName = t.company_name || "Unknown Client";
      if (!clientMap.has(clientName)) {
        clientMap.set(clientName, { clientName, count: 0, tasks: [] });
      }
      const cg = clientMap.get(clientName)!;
      cg.count++;
      cg.tasks.push(t);
    }

    const clean = (arr: any[]) =>
      arr.map(({ _officerId, ...rest }: any) => rest);

    return NextResponse.json({
      report: { id: report.id, name: report.name },
      department: department ? { name: department.name } : null,
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
        byClient: Array.from(clientMap.values()).map((g) => ({
          ...g,
          tasks: clean(g.tasks),
        })),
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
