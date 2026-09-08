// @ts-nocheck
"use client";

import React, { useMemo, useState, useEffect, useCallback } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "@/lib/hooks/use-toast";
import { supabase } from "@/lib/supabase/client";
import * as XLSX from "xlsx";
import { parseDate } from "@/app/generic-functions/dateUtils";
import {
  fetchTasks,
  fetchStages,
  fetchCompanies,
  fetchAllDocuments,
  fetchAllKycFields,
} from "../tasks/utils/taskManagerData";
import { fetchDepartments } from "../departments/departments/database";
import { getOfficerDisplayName } from "@/lib/shared-user-assignment-service";
import { userService } from "@/lib/shared-user-assignment-service";
import { useCurrentUser } from "@/lib/hooks/use-current-user";
import { auditActor } from "../tasks/utils/audit";
import {
  getCurrentStageStatus,
  enhanceTasksWithIndividualData,
} from "../tasks/overall-view/tableUtils";
import { cn } from "@/lib/utils";
import {
  TrackerHeader,
  TrackerStatusFilter,
} from "./components/TrackerHeader";
import { ImmigrationTrackerView, INFO_COLUMNS, BCL_USER_COLUMNS } from "./components/ImmigrationTrackerView";

const TARGET_DEPT_ID = "1";

// Stage definitions with UUIDs (from the database)
const STAGE_COLUMNS = [
  { id: "1e6ebd85-db1e-4eb9-abb6-5fc145ac8caa", label: "Enquiry", hasDateInput: false },
  { id: "d59923c0-45ad-48be-aa26-211dea362372", label: "Application Form", hasDateInput: false },
  { id: "0381a733-a6de-46fe-8d29-5f9f407f17a2", label: "Pro.Payment Receipt", hasDateInput: false },
  { id: "aa6c99e0-914c-45ea-af31-1bb3fc1d7e81", label: "Application in Progress", hasDateInput: false },
  { id: "04c280a2-da2c-48b2-91a8-d3b1830ce3e9", label: "Approval", hasDateInput: false },
  { id: "13706cc1-2a10-407b-8e69-2e0835f2b506", label: "Issuance Receipt", hasDateInput: false },
  { id: "072b9710-45df-4a05-ba65-01b4ef29d61d", label: "Write Up", hasDateInput: false },
  { id: "nyayo_to_bcl", label: "Nyayo to Bcl", hasDateInput: true },
  { id: "bcl_to_client", label: "Bcl to client", hasDateInput: true },
  { id: "client_to_bcl", label: "Client to Bcl", hasDateInput: true },
  { id: "caefd742-5de5-4341-a3bb-81d7b9dd2b73", label: "PP. Endorsement", hasDateInput: false },
];

export default function ImmigrationTrackerPage() {
  const { user: currentUser } = useCurrentUser();
  const actor = auditActor(currentUser);
  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState<any[]>([]);
  const [stages, setStages] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [companies, setCompanies] = useState<
    Map<number, { name: string; prefix: string }>
  >(new Map());
  const [allDocuments, setAllDocuments] = useState<any[]>([]);
  const [kycDocuments, setKycDocuments] = useState<Map<string, any>>(
    new Map()
  );
  const [enhancedTasksData, setEnhancedTasksData] = useState<
    Map<string, any>
  >(new Map());
  const [taskDependants, setTaskDependants] = useState<Map<string, any[]>>(
    new Map()
  );
  const [unifiedOfficers, setUnifiedOfficers] = useState<any[]>([]);

  const [activeDeptId, setActiveDeptId] = useState<string>(TARGET_DEPT_ID);
  const [activeSubDeptIds, setActiveSubDeptIds] = useState<string[]>([]);
  const [activeStatus, setActiveStatus] = useState<string>("wip");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [sortConfig, setSortConfig] = useState<{
    key: string;
    direction: "asc" | "desc";
  } | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(30);
  const [view, setView] = useState<"standard" | "transposed">("standard");
  const [showTime, setShowTime] = useState(false);
  const [showDelta, setShowDelta] = useState(false);
  const [visibleStageColumnIds, setVisibleStageColumnIds] = useState<string[]>(
    STAGE_COLUMNS.map((c) => c.id)
  );
  const [visibleInfoColumnIds, setVisibleInfoColumnIds] = useState<string[]>(
    ["sub_dept", "class_name", "company_prefix"]
  );
  const [bclUsers, setBclUsers] = useState<{ id: string; name: string; email: string }[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [showBclUsers, setShowBclUsers] = useState(false);

  const activeDepartment = useMemo(
    () => departments.find((d) => d.id.toString() === activeDeptId),
    [departments, activeDeptId]
  );

  const activeSubDepartments = useMemo(
    () => activeDepartment?.tm_subdepartments || [],
    [activeDepartment]
  );

  // Fetch all data on mount
  useEffect(() => {
    const init = async () => {
      setLoading(true);
      try {
        const [depts, comps, docs, kycFields] = await Promise.all([
          fetchDepartments(),
          fetchCompanies(),
          fetchAllDocuments(),
          fetchAllKycFields(),
        ]);

        const targetDept = depts.find(
          (d) => d.id.toString() === TARGET_DEPT_ID
        );
        const deptId = targetDept?.id?.toString() || depts[0]?.id?.toString();

        const [tasksData, stagesData] = await Promise.all([
          fetchTasks(deptId, undefined, comps),
          deptId ? fetchStages(deptId, depts) : Promise.resolve([]),
        ]);

        const safeTasks = Array.isArray(tasksData) ? tasksData : [];

        const {
          enhancedTasksData: enhancedMap,
          taskDependants: dependantsMap,
        } = await enhanceTasksWithIndividualData(safeTasks);

        // Merge enhanced data (r_number, applicant_data, etc.) back into each task
        const mergedTasks = safeTasks.map((t) => ({
          ...t,
          ...(enhancedMap.get(t.id.toString()) || {}),
        }));

        const unifiedUserData = await userService.getAllUserData(
          { payrollAccess: true },
          depts
        );

        setDepartments(depts);
        setCompanies(comps);
        setAllDocuments(docs);
        setKycDocuments(kycFields?.kycDocsMap || new Map());
        setTasks(mergedTasks);
        setStages(stagesData);
        setTaskDependants(dependantsMap);
        setEnhancedTasksData(enhancedMap);
        setUnifiedOfficers(unifiedUserData.officers || []);

        if (deptId) setActiveDeptId(deptId);
      } catch (error) {
        console.error("Error loading immigration tracker data", error);
        toast({
          title: "Error",
          description: "Failed to load tracker data.",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    };
    init();
  }, []);

  // Fetch BCL users (company_id = 10) and current session user
  useEffect(() => {
    const fetchBclData = async () => {
      try {
        const [{ data: bclData }, sessionRes] = await Promise.all([
          supabase
            .from("scanner_users")
            .select("id, first_name, last_name, email")
            .eq("company_id", 10)
            .eq("is_active", true),
          fetch("/api/auth/session"),
        ]);

        if (bclData) {
          setBclUsers(
            bclData.map((u: any) => ({
              id: u.id,
              name: `${u.first_name || ""} ${u.last_name || ""}`.trim() || u.email || u.id,
              email: u.email || "",
            }))
          );
        }

        const sessionJson = await sessionRes.json().catch(() => ({}));
        if (sessionJson?.authenticated && sessionJson?.user?.id) {
          setCurrentUserId(sessionJson.user.id);
        }
      } catch (e) {
        console.error("Error fetching BCL users:", e);
      }
    };
    fetchBclData();
  }, []);

  // Refresh data helper
  const refreshData = useCallback(async () => {
    try {
      const comps = await fetchCompanies();
      const tasksData = await fetchTasks(activeDeptId, undefined, comps);
      const safeTasks = Array.isArray(tasksData) ? tasksData : [];
      const { enhancedTasksData: enhancedMap, taskDependants: dependantsMap } =
        await enhanceTasksWithIndividualData(safeTasks);
      const mergedTasks = safeTasks.map((t) => ({
        ...t,
        ...(enhancedMap.get(t.id.toString()) || {}),
      }));
      setCompanies(comps);
      setTasks(mergedTasks);
      setTaskDependants(dependantsMap);
      setEnhancedTasksData(enhancedMap);
    } catch (error) {
      console.error("Error refreshing data", error);
    }
  }, [activeDeptId]);

  const getStaffName = useCallback(
    (userId: any) => {
      if (!userId) return "";
      const userIdStr = String(userId);
      const officer = unifiedOfficers.find((o) => o.id === userIdStr);
      if (officer)
        return (
          getOfficerDisplayName(officer) ||
          officer.full_name ||
          officer.name ||
          `Officer ${userId}`
        );
      return userIdStr;
    },
    [unifiedOfficers]
  );

  // Get stage date from task
  const getStageDate = useCallback(
    (task: any, stageId: string): string | null => {
      const stageData = task.stages?.[stageId];
      if (!stageData) return null;
      return stageData.date || stageData.completedAt || null;
    },
    []
  );

  // Get stage status for display
  const getStageStatus = useCallback(
    (task: any, stageId: string): "completed" | "pending" | "missing" => {
      const stageData = task.stages?.[stageId];
      if (!stageData) return "pending";
      if (
        stageData.status === "completed" ||
        stageData.completedAt ||
        stageData.date
      ) {
        return "completed";
      }
      return "pending";
    },
    []
  );

  // Save stage date to database
  const handleSaveStageDate = useCallback(
    async (taskId: string, stageId: string, date: string, bclUserId?: string | null, bclUserName?: string) => {
      try {
        const { data: currentTask, error: fetchError } = await supabase
          .from("tm_tasks")
          .select("stages, status")
          .eq("id", taskId)
          .single();

        if (fetchError) throw fetchError;

        let taskStatusUpdate = {};
        if (stageId === "caefd742-5de5-4341-a3bb-81d7b9dd2b73") {
          taskStatusUpdate = { status: "endorsed" };
        } else if (stageId === "072b9710-45df-4a05-ba65-01b4ef29d61d") {
          taskStatusUpdate = { status: "write_up_completed" };
        }

        const existingStages = currentTask?.stages || {};
        const timestamp = new Date().toISOString();

        const updatedStages = {
          ...existingStages,
          [stageId]: {
            ...existingStages[stageId],
            date: date,
            status: "completed",
            completedAt: timestamp,
            updatedAt: timestamp,
            completed_by_id: actor.by_id,
            updated_by_id: actor.by_id,
            ...(bclUserId ? { entered_by: bclUserId, entered_by_name: bclUserName || "" } : {}),
          },
        };

        const { error: updateError } = await supabase
          .from("tm_tasks")
          .update({ ...taskStatusUpdate, stages: updatedStages, updated_at: timestamp, updated_by_id: actor.by_id })
          .eq("id", taskId);

        if (updateError) throw updateError;

        setTasks((prev) =>
          prev.map((t) =>
            t.id === taskId ? { ...t, stages: updatedStages, ...taskStatusUpdate } : t
          )
        );

        toast({ title: "Success", description: "Stage date updated successfully." });
      } catch (error) {
        console.error("Error updating stage date:", error);
        toast({ title: "Error", description: "Failed to update stage date.", variant: "destructive" });
      }
    },
    [currentUser]
  );

  // Filtered tasks
  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      // Status filter
      if (activeStatus === "wip") {
        const isWriteUp = task.status === "write_up_completed";
        const isEndorsed = task.status === "endorsed";
        const isCancelled = task.status === "cancel";
        const isCompleted =
          isWriteUp ||
          isEndorsed ||
          ["completed", "archived"].includes(task.status);
        if (isCompleted || isCancelled) return false;
      } else if (activeStatus === "write_up_completed") {
        if (task.status !== "write_up_completed") return false;
      } else if (activeStatus === "endorsed") {
        if (task.status !== "endorsed") return false;
      }

      // Sub-department filter
      if (activeSubDeptIds.length > 0) {
        const taskSubDeptId = task.subdepartment_id?.toString();
        if (!activeSubDeptIds.includes(taskSubDeptId)) return false;
      }

      return true;
    });
  }, [tasks, activeStatus, activeSubDeptIds]);

  // Search filter
  const searchedTasks = useMemo(() => {
    if (!searchQuery) return filteredTasks;
    const q = searchQuery.toLowerCase();
    return filteredTasks.filter(
      (t) =>
        t.id?.toString().includes(q) ||
        t.applicant_name?.toLowerCase().includes(q) ||
        t.company_name?.toLowerCase().includes(q) ||
        t.passport_number?.toLowerCase().includes(q)
    );
  }, [filteredTasks, searchQuery]);

  // Sort
  const sortedTasks = useMemo(() => {
    if (!sortConfig) return searchedTasks;
    const sorted = [...searchedTasks];
    sorted.sort((a, b) => {
      let av: any;
      let bv: any;

      switch (sortConfig.key) {
        case "r_number":
          av = a.applicant_data?.r_number || "";
          bv = b.applicant_data?.r_number || "";
          break;
        case "passport_number":
          av = a.passport_number || "";
          bv = b.passport_number || "";
          break;
        case "applicant_name":
          av = a.applicant_name || "";
          bv = b.applicant_name || "";
          break;
        case "company_prefix":
          av = companies.get(a.company_id)?.prefix || "";
          bv = companies.get(b.company_id)?.prefix || "";
          break;
        default:
          // For stage columns, sort by date completion
          const stageCol = STAGE_COLUMNS.find((c) => c.id === sortConfig.key);
          if (stageCol) {
            av = getStageDate(a, stageCol.id) || "";
            bv = getStageDate(b, stageCol.id) || "";
          } else {
            return 0;
          }
      }

      if (typeof av === "string") av = av.toLowerCase();
      if (typeof bv === "string") bv = bv.toLowerCase();

      if (av < bv) return sortConfig.direction === "asc" ? -1 : 1;
      if (av > bv) return sortConfig.direction === "asc" ? 1 : -1;
      return 0;
    });
    return sorted;
  }, [searchedTasks, sortConfig, companies, getStageDate]);

  // Excel export — must be after sortedTasks
  const handleExcelExport = useCallback(() => {
    if (!sortedTasks.length) {
      toast({ title: "No Data", description: "No tasks to export.", variant: "destructive" });
      return;
    }
    try {
      const rows = sortedTasks.map((task: any) => {
        const row: Record<string, any> = {
          "Task ID": task.id,
          "R Number": task.r_number || task.applicant_data?.r_number || "",
          "Passport No.": task.passport_number || "",
          "Applicant Name": task.applicant_name || "",
          "Company": companies.get(task.company_id)?.name || "",
          "Sub Department": task.subdepartment_name || "",
          "Status": task.status || "",
        };
        STAGE_COLUMNS.forEach((sc) => {
          const date = getStageDate(task, sc.id);
          row[sc.label] = date || "";
          if (sc.hasDateInput) {
            row[`${sc.label} (By)`] = task.stages?.[sc.id]?.entered_by_name || "";
          }
        });
        return row;
      });
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Immigration Tracker");
      XLSX.writeFile(wb, `immigration_tracker_${new Date().toISOString().slice(0, 10)}.xlsx`);
      toast({ title: "Export Successful", description: `Exported ${rows.length} rows.` });
    } catch (e) {
      console.error("Export error:", e);
      toast({ title: "Export Failed", description: "Could not export data.", variant: "destructive" });
    }
  }, [sortedTasks, companies, getStageDate]);

  // KPI counts (based on filtered tasks before status filter)
  const baseFilteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      if (activeSubDeptIds.length > 0) {
        const taskSubDeptId = task.subdepartment_id?.toString();
        if (!activeSubDeptIds.includes(taskSubDeptId)) return false;
      }
      return true;
    });
  }, [tasks, activeSubDeptIds]);

  const allTasksCount = baseFilteredTasks.length;

  const wipTasksCount = useMemo(() => {
    return baseFilteredTasks.filter((task) => {
      const isWriteUp = task.status === "write_up_completed";
      const isEndorsed = task.status === "endorsed";
      const isCancelled = task.status === "cancel";
      const isCompleted =
        isWriteUp ||
        isEndorsed ||
        ["completed", "archived"].includes(task.status);
      return !isCompleted && !isCancelled;
    }).length;
  }, [baseFilteredTasks]);

  const writeUpCompletedCount = useMemo(
    () => baseFilteredTasks.filter((t) => t.status === "write_up_completed").length,
    [baseFilteredTasks]
  );

  const endorsedCount = useMemo(
    () => baseFilteredTasks.filter((t) => t.status === "endorsed").length,
    [baseFilteredTasks]
  );

  const handleSort = (columnId: string) => {
    setSortConfig((cur) => {
      if (cur?.key === columnId)
        return {
          key: columnId,
          direction: cur.direction === "asc" ? "desc" : "asc",
        };
      return { key: columnId, direction: "asc" };
    });
  };

  if (loading) {
    return (
      <div className="flex-1 p-8 bg-slate-100 flex items-center justify-center min-h-screen">
        <div className="text-center space-y-4">
          <Loader2 className="h-10 w-10 animate-spin text-slate-400 mx-auto" />
          <p className="text-sm font-medium text-slate-500">
            Loading Immigration Tracker...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 overflow-hidden flex-col bg-slate-100">
      {/* Header */}
      <TrackerHeader
        activeDepartment={activeDepartment}
        activeSubDepartments={activeSubDepartments}
        activeSubDeptIds={activeSubDeptIds}
        setActiveSubDeptIds={setActiveSubDeptIds}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        view={view}
        setView={setView}
        showTime={showTime}
        setShowTime={setShowTime}
        showDelta={showDelta}
        setShowDelta={setShowDelta}
        stageColumns={STAGE_COLUMNS}
        visibleStageColumnIds={visibleStageColumnIds}
        setVisibleStageColumnIds={setVisibleStageColumnIds}
        infoColumns={INFO_COLUMNS}
        visibleInfoColumnIds={visibleInfoColumnIds}
        setVisibleInfoColumnIds={setVisibleInfoColumnIds}
        showBclUsers={showBclUsers}
        setShowBclUsers={setShowBclUsers}
        onRefresh={refreshData}
        onExportExcel={handleExcelExport}
        loading={loading}
      />

      {/* Status Filter Tabs */}
      <TrackerStatusFilter
        activeStatus={activeStatus}
        setActiveStatus={setActiveStatus}
        allTasksCount={allTasksCount}
        wipTasksCount={wipTasksCount}
        writeUpCompletedCount={writeUpCompletedCount}
        endorsedCount={endorsedCount}
      />

      {/* Table */}
      <div className="flex-1 overflow-hidden pt-4 px-4 pb-4">
        <ImmigrationTrackerView
          tasks={sortedTasks}
          stageColumns={STAGE_COLUMNS}
          stages={stages}
          sortConfig={sortConfig}
          handleSort={handleSort}
          currentPage={currentPage}
          setCurrentPage={setCurrentPage}
          rowsPerPage={rowsPerPage}
          setRowsPerPage={setRowsPerPage}
          getStageDate={getStageDate}
          getStageStatus={getStageStatus}
          onSaveStageDate={handleSaveStageDate}
          companies={companies}
          view={view}
          showTime={showTime}
          showDelta={showDelta}
          visibleStageColumnIds={visibleStageColumnIds}
          visibleInfoColumnIds={visibleInfoColumnIds}
          departments={departments}
          getStaffName={getStaffName}
          bclUsers={bclUsers}
          currentUserId={currentUserId}
          showBclUsers={showBclUsers}
        />
      </div>
    </div>
  );
}
