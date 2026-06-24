// @ts-nocheck
"use client";

import React, { useMemo, useState, useEffect, useCallback } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "@/lib/hooks/use-toast";
import { supabase } from "@/lib/supabase/client";
import { formatDuration } from "../tasks/overall-view/tableUtils";
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
import {
  getCurrentStageStatus,
  enhanceTasksWithIndividualData,
} from "../tasks/overall-view/tableUtils";
import { cn } from "@/lib/utils";
import { TrackerSidebar } from "./components/TrackerSidebar";
import {
  TrackerHeader,
  TrackerStatusFilter,
} from "./components/TrackerHeader";
import { ImmigrationTrackerView } from "./components/ImmigrationTrackerView";

const TARGET_DEPT_ID = "1";

export default function ImmigrationTrackerPage() {
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
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

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

        // Filter to target department
        const targetDept = depts.find(
          (d) => d.id.toString() === TARGET_DEPT_ID
        );
        const deptId = targetDept?.id?.toString() || depts[0]?.id?.toString();

        const [tasksData, stagesData] = await Promise.all([
          fetchTasks(deptId, undefined, comps),
          deptId ? fetchStages(deptId, depts) : Promise.resolve([]),
        ]);

        const safeTasks = Array.isArray(tasksData) ? tasksData : [];

        const { enhancedTasksData: enhancedMap, taskDependants: dependantsMap } =
          await enhanceTasksWithIndividualData(safeTasks);

        // Load unified user data
        const unifiedUserData = await userService.getAllUserData(
          { payrollAccess: true },
          depts
        );

        setDepartments(depts);
        setCompanies(comps);
        setAllDocuments(docs);
        setKycDocuments(kycFields?.kycDocsMap || new Map());
        setTasks(safeTasks);
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

  // Determine current stage status for a task
  const getTaskCurrentStage = useCallback(
    (task: any) => {
      if (!stages.length || !departments.length) {
        return { stageName: "No Stage", stageFollowUp: null };
      }
      const result = getCurrentStageStatus(task, stages, departments, allDocuments);
      return {
        stageName: result.stageName || "Unknown",
        stageFollowUp: result.stageFollowUp || null,
      };
    },
    [stages, departments, allDocuments]
  );

  // Get current officer stage and assigned officer names
  const getTaskCurrentOfficers = useCallback(
    (task: any): string[] => {
      if (!stages.length || !departments.length) return [];

      const sortedStages = [...stages]
        .filter((stage) => {
          // Basic applicability check
          const dept = departments.find(
            (d) => d.id === (task.department?.id || task.department_id)
          );
          if (!dept) return true;
          return true;
        })
        .sort((a, b) => (a.order_num || 0) - (b.order_num || 0));

      // Find first officer stage that is not completed
      const currentOfficerStage = sortedStages.find((stage) => {
        const stageData = task?.stages?.[stage?.id];
        const status = stageData?.status?.toString().toLowerCase();
        return (
          stageData &&
          stage.follow_up?.toLowerCase() === "officer" &&
          status !== "completed" &&
          status !== "skipped"
        );
      });

      if (!currentOfficerStage) return [];

      const officerIds =
        task?.stages?.[currentOfficerStage.id]?.officer_ids || [];
      const ids = Array.isArray(officerIds)
        ? officerIds.map((id) => id?.toString()).filter(Boolean)
        : [];

      return ids.map((id) => getStaffName(id)).filter(Boolean);
    },
    [stages, departments, getStaffName]
  );

  // Get stage age in days
  const getTaskAgeDays = useCallback(
    (task: any): number | null => {
      if (!stages.length || !departments.length) return null;

      const sortedStages = [...stages]
        .sort((a, b) => (a.order_num || 0) - (b.order_num || 0));

      let latestHandledAt: Date | null = null;

      sortedStages.forEach((stage) => {
        const stageData = task?.stages?.[stage?.id];
        if (!stageData) return;

        const directDate = parseDate(
          stageData.completedAt ||
            stageData.skippedAt ||
            stageData.date_completed ||
            stageData.date ||
            stageData.lastUpdated ||
            null
        );

        if (directDate) {
          if (!latestHandledAt || directDate.getTime() > latestHandledAt.getTime()) {
            latestHandledAt = directDate;
          }
        }
      });

      if (!latestHandledAt) return null;

      const elapsedMs = Date.now() - latestHandledAt.getTime();
      const elapsedDays = Math.floor(elapsedMs / (1000 * 60 * 60 * 24));
      return elapsedDays;
    },
    [stages, departments]
  );

  // Get sub department name
  const getSubDeptName = useCallback(
    (task: any): string => {
      const subdeptId = task.subdepartment_id?.toString();
      if (!subdeptId || !activeDepartment) return "—";
      const subdept = activeDepartment.tm_subdepartments?.find(
        (s) => s.id.toString() === subdeptId
      );
      return subdept?.name || "—";
    },
    [activeDepartment]
  );

  // Get class name
  const getClassName = useCallback(
    (task: any): string => {
      const classId = task.class_id?.toString();
      if (!classId || !activeDepartment) return "—";
      for (const sub of activeDepartment.tm_subdepartments || []) {
        const cls = sub.classes?.find(
          (c) => c.id.toString() === classId
        );
        if (cls) return cls.name;
      }
      return "—";
    },
    [activeDepartment]
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
        case "sub_department":
          av = getSubDeptName(a);
          bv = getSubDeptName(b);
          break;
        case "class":
          av = getClassName(a);
          bv = getClassName(b);
          break;
        case "duration":
          av = a.applicant_data?.duration || "";
          bv = b.applicant_data?.duration || "";
          break;
        case "renewal_status":
          av = a.renewal_status || "";
          bv = b.renewal_status || "";
          break;
        case "current_stage_name":
          av = getTaskCurrentStage(a).stageName;
          bv = getTaskCurrentStage(b).stageName;
          break;
        case "current_stage_follow_up":
          av = getTaskCurrentStage(a).stageFollowUp || "";
          bv = getTaskCurrentStage(b).stageFollowUp || "";
          break;
        case "current_stage_officer":
          av = getTaskCurrentOfficers(a).join(", ");
          bv = getTaskCurrentOfficers(b).join(", ");
          break;
        case "age_days":
          av = getTaskAgeDays(a) ?? -1;
          bv = getTaskAgeDays(b) ?? -1;
          break;
        default:
          return 0;
      }

      if (typeof av === "string") av = av.toLowerCase();
      if (typeof bv === "string") bv = bv.toLowerCase();

      if (av < bv) return sortConfig.direction === "asc" ? -1 : 1;
      if (av > bv) return sortConfig.direction === "asc" ? 1 : -1;
      return 0;
    });
    return sorted;
  }, [
    searchedTasks,
    sortConfig,
    companies,
    getSubDeptName,
    getClassName,
    getTaskCurrentStage,
    getTaskCurrentOfficers,
    getTaskAgeDays,
  ]);

  // KPI counts
  const allTasksCount = useMemo(() => {
    return tasks.filter((task) => {
      if (activeSubDeptIds.length > 0) {
        const taskSubDeptId = task.subdepartment_id?.toString();
        if (!activeSubDeptIds.includes(taskSubDeptId)) return false;
      }
      return true;
    });
  }, [tasks, activeSubDeptIds]);

  const wipTasksCount = useMemo(() => {
    return allTasksCount.filter((task) => {
      const isWriteUp = task.status === "write_up_completed";
      const isEndorsed = task.status === "endorsed";
      const isCancelled = task.status === "cancel";
      const isCompleted =
        isWriteUp ||
        isEndorsed ||
        ["completed", "archived"].includes(task.status);
      return !isCompleted && !isCancelled;
    }).length;
  }, [allTasksCount]);

  const writeUpCompletedCount = useMemo(
    () => allTasksCount.filter((t) => t.status === "write_up_completed").length,
    [allTasksCount]
  );

  const endorsedCount = useMemo(
    () => allTasksCount.filter((t) => t.status === "endorsed").length,
    [allTasksCount]
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

  // Cell value getter
  const getCellValue = useCallback(
    (task: any, colId: string) => {
      switch (colId) {
        case "r_number":
          return task.applicant_data?.r_number || task.r_number || "—";
        case "passport_number":
          return task.passport_number || "—";
        case "applicant_name":
          return task.applicant_name || "—";
        case "company_prefix":
          return companies.get(task.company_id)?.prefix || "—";
        case "sub_department":
          return getSubDeptName(task);
        case "class":
          return getClassName(task);
        case "duration":
          return task.applicant_data?.duration || task.duration || "—";
        case "renewal_status":
          return task.renewal_status || "—";
        case "current_stage_name":
          return getTaskCurrentStage(task).stageName;
        case "current_stage_follow_up":
          return getTaskCurrentStage(task).stageFollowUp;
        case "current_stage_officer":
          return getTaskCurrentOfficers(task);
        case "age_days":
          return getTaskAgeDays(task);
        default:
          return "—";
      }
    },
    [
      companies,
      getSubDeptName,
      getClassName,
      getTaskCurrentStage,
      getTaskCurrentOfficers,
      getTaskAgeDays,
    ]
  );

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
    <div className="flex flex-1 overflow-hidden">
      {/* Sidebar */}
      <TrackerSidebar
        departments={departments}
        activeDeptId={activeDeptId}
        setActiveDeptId={setActiveDeptId}
        activeSubDepartments={activeSubDepartments}
        activeSubDeptIds={activeSubDeptIds}
        setActiveSubDeptIds={setActiveSubDeptIds}
        isCollapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed((p) => !p)}
      />

      {/* Main Content */}
      <div className="flex flex-col flex-1 overflow-hidden bg-slate-100">
        {/* Header */}
        <TrackerHeader
          activeDepartment={activeDepartment}
          activeSubDepartments={activeSubDepartments}
          activeSubDeptIds={activeSubDeptIds}
          allTasksCount={allTasksCount.length}
          wipTasksCount={wipTasksCount}
          writeUpCompletedCount={writeUpCompletedCount}
          endorsedCount={endorsedCount}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
        />

        {/* Status Filter Tabs */}
        <TrackerStatusFilter
          activeStatus={activeStatus}
          setActiveStatus={setActiveStatus}
          allTasksCount={allTasksCount.length}
          wipTasksCount={wipTasksCount}
          writeUpCompletedCount={writeUpCompletedCount}
          endorsedCount={endorsedCount}
        />

        {/* Table */}
        <div className="flex-1 overflow-hidden pt-4 px-4 pb-4">
          <ImmigrationTrackerView
            tasks={sortedTasks}
            sortConfig={sortConfig}
            handleSort={handleSort}
            currentPage={currentPage}
            setCurrentPage={setCurrentPage}
            rowsPerPage={rowsPerPage}
            setRowsPerPage={setRowsPerPage}
            getCellValue={getCellValue}
          />
        </div>
      </div>
    </div>
  );
}
