// @ts-nocheck
"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import * as XLSX from "xlsx";
import { toast } from "@/lib/hooks/use-toast";
import { fetchCompanies } from "../tasks/utils/taskManagerData";
import { fetchDepartments } from "../departments/departments/database";
import {
  fetchQualifyingTasks,
  fetchBclUsers,
  fetchCouriers,
  fetchHandlingRecords,
  getHandlingStep,
  STEP_LABELS,
  IMMIGRATION_DEPT_ID,
  type PassportHandlingRecord,
  type Courier,
  type HandlingStep,
} from "./utils/database";
import { PageHeader, StatusTabs, HierarchyTabs } from "./components/PageHeader";
import { HandlingTable, HANDLING_COLUMNS, DEFAULT_VISIBLE_COLUMN_IDS } from "./components/HandlingTable";
import { HandlingWizardDialog } from "./components/HandlingWizardDialog";
import { CourierRegistryDialog } from "./components/CourierRegistryDialog";

export default function PassportEndorsementPage() {
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [tasks, setTasks] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [companies, setCompanies] = useState<Map<number, { name: string; prefix: string }>>(new Map());
  const [bclUsers, setBclUsers] = useState<{ id: string; name: string }[]>([]);
  const [couriers, setCouriers] = useState<Courier[]>([]);
  const [handlingRecords, setHandlingRecords] = useState<Map<number, PassportHandlingRecord>>(new Map());
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [activeSubDeptId, setActiveSubDeptId] = useState<string>("all");
  const [activeClassIds, setActiveClassIds] = useState<string[]>([]);
  const [activeSubClassIds, setActiveSubClassIds] = useState<string[]>([]);
  const [activeStep, setActiveStep] = useState<HandlingStep | "all">("all");
  const [visibleColumnIds, setVisibleColumnIds] = useState<string[]>(DEFAULT_VISIBLE_COLUMN_IDS);
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: "asc" | "desc" } | null>(null);

  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardTask, setWizardTask] = useState<any>(null);
  const [courierDialogOpen, setCourierDialogOpen] = useState(false);

  const loadAll = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [comps, depts, bcl, couriersData, sessionRes] = await Promise.all([
        fetchCompanies(),
        fetchDepartments(),
        fetchBclUsers(),
        fetchCouriers(false),
        fetch("/api/auth/session").then((r) => r.json()).catch(() => ({})),
      ]);
      const qualifyingTasks = await fetchQualifyingTasks(comps);
      const records = await fetchHandlingRecords(qualifyingTasks.map((t: any) => t.id));

      setCompanies(comps);
      setDepartments(depts);
      setBclUsers(bcl);
      setCouriers(couriersData);
      setTasks(qualifyingTasks);
      setHandlingRecords(records);
      if (sessionRes?.authenticated && sessionRes?.user?.id) setCurrentUserId(sessionRes.user.id);
    } catch (err) {
      console.error("Error loading passport endorsement data:", err);
      toast({ title: "Error", description: "Failed to load passport endorsement data.", variant: "destructive" });
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await loadAll(true);
    setIsRefreshing(false);
    toast({ title: "Refreshed", description: "Passport endorsement data updated." });
  }, [loadAll]);

  const getStaffName = useCallback((userId: any) => {
    if (!userId) return "";
    const u = bclUsers.find((b) => b.id === userId);
    return u?.name || "";
  }, [bclUsers]);

  const rows = useMemo(() => tasks.map((task) => {
    const record = handlingRecords.get(task.id);
    const mode = task.passport_handling_mode || null;
    const step = getHandlingStep(mode, record);
    return { task, record, mode, step };
  }), [tasks, handlingRecords]);

  const immigrationDept = useMemo(
    () => departments.find((d: any) => d.id.toString() === IMMIGRATION_DEPT_ID),
    [departments]
  );
  const subDepartments = immigrationDept?.tm_subdepartments || [];

  // Rows scoped by Sub-department only (not yet by Class/Sub-Class) — the base the Class/
  // Sub-Class dropdowns' own counts are computed from, same as Summary Reports' HierarchyTabs.
  const subDeptScopedRows = useMemo(() => {
    if (activeSubDeptId === "all") return rows;
    return rows.filter(({ task }) => task.subdepartment_id?.toString() === activeSubDeptId);
  }, [rows, activeSubDeptId]);

  const hierarchyScopedRows = useMemo(() => subDeptScopedRows.filter(({ task }) => {
    if (activeClassIds.length > 0 && !activeClassIds.includes(task.class_id?.toString())) return false;
    if (activeSubClassIds.length > 0 && !activeSubClassIds.includes(task.subclass_id?.toString())) return false;
    return true;
  }), [subDeptScopedRows, activeClassIds, activeSubClassIds]);

  const subDeptTaskCounts = useMemo(() => {
    const counts: Record<string, number> = { all: rows.length };
    subDepartments.forEach((s: any) => {
      counts[s.id.toString()] = rows.filter(({ task }) => task.subdepartment_id?.toString() === s.id.toString()).length;
    });
    return counts;
  }, [rows, subDepartments]);

  // Classes/Sub-Classes available under the active Sub-department (or every class across all
  // sub-departments when "All Sub-departments" is selected) — same shape as Summary Reports'
  // availableClasses/availableSubClasses.
  const availableClasses = useMemo(() => {
    const map = new Map<string, any>();
    const collect = (subDepts: any[]) => (subDepts || []).forEach((s: any) => (s.classes || []).forEach((c: any) => {
      if (!map.has(c.id.toString())) map.set(c.id.toString(), { ...c, subdepartmentId: s.id, subDepartmentName: s.name });
    }));
    if (activeSubDeptId !== "all") {
      const sub = subDepartments.find((s: any) => s.id.toString() === activeSubDeptId);
      if (sub) collect([sub]);
    } else {
      collect(subDepartments);
    }
    return Array.from(map.values());
  }, [subDepartments, activeSubDeptId]);

  const availableSubClasses = useMemo(() => {
    const map = new Map<string, any>();
    const pool = activeClassIds.length > 0
      ? availableClasses.filter((c: any) => activeClassIds.includes(c.id.toString()))
      : availableClasses;
    pool.forEach((c: any) => (c.subClasses || []).forEach((sc: any) => {
      if (!map.has(sc.id.toString())) map.set(sc.id.toString(), { ...sc, classId: c.id, className: c.name });
    }));
    return Array.from(map.values());
  }, [availableClasses, activeClassIds]);

  const classCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    subDeptScopedRows.forEach(({ task }) => {
      const cid = task.class_id?.toString();
      if (cid) counts[cid] = (counts[cid] || 0) + 1;
    });
    return counts;
  }, [subDeptScopedRows]);

  const subClassCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    subDeptScopedRows.forEach(({ task }) => {
      const sid = task.subclass_id?.toString();
      if (sid) counts[sid] = (counts[sid] || 0) + 1;
    });
    return counts;
  }, [subDeptScopedRows]);

  const searchedRows = useMemo(() => {
    if (!searchQuery.trim()) return hierarchyScopedRows;
    const q = searchQuery.toLowerCase();
    return hierarchyScopedRows.filter(({ task }) =>
      task.applicant_name?.toLowerCase().includes(q) ||
      task.passport_number?.toLowerCase().includes(q) ||
      companies.get(task.company_id)?.name?.toLowerCase().includes(q)
    );
  }, [hierarchyScopedRows, searchQuery, companies]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: searchedRows.length };
    searchedRows.forEach(({ step }) => { c[step] = (c[step] || 0) + 1; });
    return c;
  }, [searchedRows]);

  const filteredRows = useMemo(() => {
    if (activeStep === "all") return searchedRows;
    return searchedRows.filter((r) => r.step === activeStep);
  }, [searchedRows, activeStep]);

  const getSortableValue = useCallback((row: any, columnId: string) => {
    const { task, record, mode, step } = row;
    switch (columnId) {
      case "applicant": return (task.applicant_name || "").toLowerCase();
      case "company": return (companies.get(task.company_id)?.name || task.company_name || "").toLowerCase();
      case "passport_number": return (task.passport_number || "").toLowerCase();
      case "mode": return mode || "";
      case "current_step": return STEP_LABELS[step] || "";
      case "received": return record?.received_at ? new Date(record.received_at).getTime() : 0;
      case "taken": return record?.taken_at ? new Date(record.taken_at).getTime() : 0;
      case "returned": return record?.returned_at ? new Date(record.returned_at).getTime() : 0;
      case "notified": return record?.client_notified_at ? new Date(record.client_notified_at).getTime() : 0;
      case "dispatch": return record?.dispatch_method || "";
      case "completed": {
        const iso = record?.delivered_at || record?.pickup_at || record?.returned_at;
        return iso ? new Date(iso).getTime() : 0;
      }
      default: return "";
    }
  }, [companies]);

  const handleSort = useCallback((columnId: string) => {
    setSortConfig((cur) => cur?.key === columnId ? { key: columnId, direction: cur.direction === "asc" ? "desc" : "asc" } : { key: columnId, direction: "asc" });
  }, []);

  const sortedRows = useMemo(() => {
    if (!sortConfig) return filteredRows;
    return [...filteredRows].sort((a, b) => {
      const av = getSortableValue(a, sortConfig.key);
      const bv = getSortableValue(b, sortConfig.key);
      if (av < bv) return sortConfig.direction === "asc" ? -1 : 1;
      if (av > bv) return sortConfig.direction === "asc" ? 1 : -1;
      return 0;
    });
  }, [filteredRows, sortConfig, getSortableValue]);

  const handleManage = useCallback((task: any) => {
    setWizardTask(task);
    setWizardOpen(true);
  }, []);

  const handleSaved = useCallback((record: PassportHandlingRecord) => {
    setHandlingRecords((prev) => {
      const next = new Map(prev);
      next.set(record.task_id, record);
      return next;
    });
  }, []);

  const handleModeSaved = useCallback((taskId: number, mode: "bcl" | "client") => {
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, passport_handling_mode: mode } : t)));
    setWizardTask((prev: any) => (prev && prev.id === taskId ? { ...prev, passport_handling_mode: mode } : prev));
  }, []);

  const handleCouriersChanged = useCallback(async () => {
    setCouriers(await fetchCouriers(false));
  }, []);

  const handleExportExcel = useCallback(() => {
    if (sortedRows.length === 0) {
      toast({ title: "No Data", description: "No rows to export.", variant: "destructive" });
      return;
    }
    try {
      const exportRows = sortedRows.map(({ task, record, mode, step }) => ({
        "Applicant": task.applicant_name || "",
        "Company": companies.get(task.company_id)?.name || task.company_name || "",
        "Passport No.": task.passport_number || "",
        "Mode": mode === "bcl" ? "BCL Handles" : mode === "client" ? "Client Handles" : "Not Set",
        "Current Step": STEP_LABELS[step],
        "Received At": record?.received_at || "",
        "Received By": getStaffName(record?.received_by) || record?.brought_by_name || "",
        "Taken At": record?.taken_at || "",
        "Taken By": getStaffName(record?.taken_by),
        "Returned At": record?.returned_at || "",
        "Returned By": getStaffName(record?.returned_by),
        "Client Notified At": record?.client_notified_at || "",
        "Dispatch Method": record?.dispatch_method || "",
        "Courier/Delivered By": record?.delivery_type === "courier" ? record?.courier_rider_name : getStaffName(record?.delivered_by),
        "Delivered At": record?.delivered_at || "",
        "Picked Up By": record?.pickup_person_name || "",
        "Picked Up At": record?.pickup_at || "",
      }));
      const ws = XLSX.utils.json_to_sheet(exportRows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Passport Endorsement");
      XLSX.writeFile(wb, `passport_endorsement_${new Date().toISOString().slice(0, 10)}.xlsx`);
      toast({ title: "Export Successful", description: `Exported ${exportRows.length} rows.` });
    } catch (err) {
      console.error("Export error:", err);
      toast({ title: "Export Failed", description: "Could not export data.", variant: "destructive" });
    }
  }, [sortedRows, companies, getStaffName]);

  if (loading) {
    return (
      <div className="flex-1 p-8 bg-slate-100 flex items-center justify-center min-h-screen">
        <div className="text-center space-y-4">
          <Loader2 className="h-10 w-10 animate-spin text-slate-400 mx-auto" />
          <p className="text-sm font-medium text-slate-500">Loading Passport Endorsement Tracking...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden bg-slate-50">
      <PageHeader
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        onRefresh={handleRefresh}
        onExportExcel={handleExportExcel}
        onOpenCouriers={() => setCourierDialogOpen(true)}
        loading={isRefreshing}
        columns={HANDLING_COLUMNS}
        visibleColumnIds={visibleColumnIds}
        setVisibleColumnIds={setVisibleColumnIds}
      />

      <HierarchyTabs
        subDepartments={subDepartments}
        activeSubDeptId={activeSubDeptId}
        setActiveSubDeptId={setActiveSubDeptId}
        subDeptTaskCounts={subDeptTaskCounts}
        availableClasses={availableClasses}
        activeClassIds={activeClassIds}
        setActiveClassIds={setActiveClassIds}
        classCounts={classCounts}
        availableSubClasses={availableSubClasses}
        activeSubClassIds={activeSubClassIds}
        setActiveSubClassIds={setActiveSubClassIds}
        subClassCounts={subClassCounts}
      />

      <StatusTabs activeStep={activeStep} setActiveStep={setActiveStep} counts={counts} />

      <div className="flex-1 overflow-hidden p-4">
        <HandlingTable
          rows={sortedRows}
          visibleColumnIds={visibleColumnIds}
          getStaffName={getStaffName}
          companies={companies}
          onManage={handleManage}
          sortConfig={sortConfig}
          handleSort={handleSort}
        />
      </div>

      <HandlingWizardDialog
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        task={wizardTask}
        record={wizardTask ? handlingRecords.get(wizardTask.id) : undefined}
        bclUsers={bclUsers}
        couriers={couriers.filter((c) => c.is_active)}
        currentUserId={currentUserId}
        onSaved={handleSaved}
        onModeSaved={handleModeSaved}
      />

      <CourierRegistryDialog
        open={courierDialogOpen}
        onOpenChange={setCourierDialogOpen}
        couriers={couriers}
        onChanged={handleCouriersChanged}
      />
    </div>
  );
}
