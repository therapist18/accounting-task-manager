import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase";

const REPORT_ID = "d0d23f1c-8073-46fa-9cef-681dc7ca2d44";

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
        participants_details
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
        renewal_status: "",
        current_stage_name: currentStageName,
        current_stage_follow_up: currentStageFollowUp,
        task_manager: taskManager,
        task_assistant: taskAssistant,
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
