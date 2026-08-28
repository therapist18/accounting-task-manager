// @ts-nocheck
"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { startOfDay, endOfDay } from "date-fns";
import { parseDateSafe } from "../summary-reports/utils/reportStageLogic";
import * as XLSX from "xlsx";
import { toast } from "@/lib/hooks/use-toast";
import { fetchCompanies, fetchStages, fetchAllDocuments, fetchAllKycFields } from "../tasks/utils/taskManagerData";
import { fetchDepartments } from "../departments/departments/database";
import {
  fetchQualifyingTasks,
  fetchBclUsers,
  fetchCouriers,
  fetchHandlingRecords,
  getHandlingStep,
  resolveWriteUpDate,
  resolveEffectiveDate,
  WRITE_UP_STAGE_ID,
  STEP_LABELS,
  IMMIGRATION_DEPT_ID,
  type PassportHandlingRecord,
  type Courier,
  type HandlingStep,
} from "./utils/database";
import { PageHeader, StatusTabs, HierarchyTabs } from "./components/PageHeader";
import { StatsRow } from "./components/StatsRow";
import { HandlingTable, HANDLING_COLUMNS, DEFAULT_VISIBLE_COLUMN_IDS, fmtStageDate } from "./components/HandlingTable";
import { HandlingWizardDialog } from "./components/HandlingWizardDialog";
import { CourierRegistryDialog } from "./components/CourierRegistryDialog";
import { MultiSort, type SortLevel } from "@/app/generic-components/MultiSort";

// Column ids whose sort values are timestamps (numeric sort, not alphabetic) — used only to
// tag MultiSort's column options with a type so the dialog can present them sensibly.
const MULTISORT_DATE_COLUMN_IDS = new Set(["write_up_date", "doc_issue_date", "doc_expiry_date", "received", "taken", "returned", "notified", "completed"]);

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
  // Real Write Up stage config (its `documents` requirement in particular) plus the linked-
  // document/KYC-field data resolveWriteUpDate needs to replicate EditableStageCell's own
  // date resolution (immigration-flagged document field > completedAt fallback > plain
  // workflow date) instead of reading stages[id].date/.completedAt directly.
  const [writeUpStage, setWriteUpStage] = useState<any>(null);
  const [allDocuments, setAllDocuments] = useState<any[]>([]);
  const [kycDocuments, setKycDocuments] = useState<Map<string, any>>(new Map());

  const [searchQuery, setSearchQuery] = useState("");
  const [dateRange, setDateRange] = useState<{ from?: Date; to?: Date }>({ from: undefined, to: undefined });
  const [activeSubDeptId, setActiveSubDeptId] = useState<string>("all");
  const [activeClassIds, setActiveClassIds] = useState<string[]>([]);
  const [activeSubClassIds, setActiveSubClassIds] = useState<string[]>([]);
  const [activeStep, setActiveStep] = useState<HandlingStep | "all">("all");
  const [activeMode, setActiveMode] = useState<string>("all");
  const [visibleColumnIds, setVisibleColumnIds] = useState<string[]>(DEFAULT_VISIBLE_COLUMN_IDS);
  // Single source of truth for sorting — the MultiSort dialog manages it as an ordered list of
  // SortLevels; a plain header-click (handleSort) collapses the list to that one column. The
  // first level is what SummaryTable's active-column highlight reads (derived into sortConfig).
  const [sortLevels, setSortLevels] = useState<SortLevel[]>([]);
  const [multiSortOpen, setMultiSortOpen] = useState(false);

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
      const [qualifyingTasks, stages, docs, kycFieldsResult] = await Promise.all([
        fetchQualifyingTasks(comps),
        fetchStages(IMMIGRATION_DEPT_ID, depts),
        fetchAllDocuments(),
        fetchAllKycFields(),
      ]);
      const records = await fetchHandlingRecords(qualifyingTasks.map((t: any) => t.id));

      setCompanies(comps);
      setDepartments(depts);
      setBclUsers(bcl);
      setCouriers(couriersData);
      setTasks(qualifyingTasks);
      setHandlingRecords(records);
      setWriteUpStage(stages.find((s: any) => s.id === WRITE_UP_STAGE_ID) || null);
      setAllDocuments(docs);
      setKycDocuments(kycFieldsResult.kycDocsMap);
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

  const getSubDeptName = useCallback((task: any) => {
    const sdId = task.subdepartment_id?.toString();
    if (!sdId) return "";
    const dept = departments.find((d: any) => (d.tm_subdepartments || []).some((s: any) => s.id.toString() === sdId));
    return dept?.tm_subdepartments?.find((s: any) => s.id.toString() === sdId)?.name || "";
  }, [departments]);

  const getClassName = useCallback((task: any) => {
    const cid = task.class_id?.toString();
    if (!cid) return "";
    for (const d of departments) {
      for (const s of d.tm_subdepartments || []) {
        const c = (s.classes || []).find((x: any) => x.id.toString() === cid);
        if (c) return c.name || "";
      }
    }
    return "";
  }, [departments]);

  const rows = useMemo(() => tasks.map((task) => {
    const record = handlingRecords.get(task.id);
    const mode = task.passport_handling_mode || null;
    const step = getHandlingStep(mode, record);
    const writeUpDate = resolveWriteUpDate(task, writeUpStage, allDocuments, kycDocuments);
    const docIssueDate = resolveEffectiveDate(task, writeUpStage, allDocuments, kycDocuments, "isEffectiveFrom");
    const docExpiryDate = resolveEffectiveDate(task, writeUpStage, allDocuments, kycDocuments, "isEffectiveTo");
    return { task, record, mode, step, writeUpDate, docIssueDate, docExpiryDate };
  }), [tasks, handlingRecords, writeUpStage, allDocuments, kycDocuments]);

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

  // Filters by the task's own initiation date (date_initiated, falling back to created_at) —
  // the one date every row has regardless of how far along its passport handling is, so the
  // filter always narrows the list rather than hiding rows that haven't reached a given step
  // (e.g. a task still "Awaiting Receipt" has no received_at yet, but always has a start date).
  const dateFilteredRows = useMemo(() => {
    if (!dateRange.from && !dateRange.to) return hierarchyScopedRows;
    const from = dateRange.from ? startOfDay(dateRange.from) : null;
    const to = dateRange.to ? endOfDay(dateRange.to) : (dateRange.from ? endOfDay(dateRange.from) : null);
    return hierarchyScopedRows.filter(({ task }) => {
      const raw = task.date_initiated || task.created_at;
      if (!raw) return false;
      const d = new Date(raw);
      if (isNaN(d.getTime())) return false;
      if (from && d < from) return false;
      if (to && d > to) return false;
      return true;
    });
  }, [hierarchyScopedRows, dateRange]);

  const searchedRows = useMemo(() => {
    if (!searchQuery.trim()) return dateFilteredRows;
    const q = searchQuery.toLowerCase();
    return dateFilteredRows.filter(({ task }) =>
      task.applicant_name?.toLowerCase().includes(q) ||
      task.passport_number?.toLowerCase().includes(q) ||
      companies.get(task.company_id)?.name?.toLowerCase().includes(q)
    );
  }, [dateFilteredRows, searchQuery, companies]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: searchedRows.length };
    searchedRows.forEach(({ step }) => { c[step] = (c[step] || 0) + 1; });
    return c;
  }, [searchedRows]);

  const filteredRows = useMemo(() => {
    let result = searchedRows;
    if (activeStep !== "all") result = result.filter((r) => r.step === activeStep);
    if (activeMode !== "all") {
      if (activeMode === "bcl") result = result.filter((r) => r.mode === "bcl");
      else if (activeMode === "client") result = result.filter((r) => r.mode === "client");
      else if (activeMode === "not_set") result = result.filter((r) => !r.mode);
    }
    return result;
  }, [searchedRows, activeStep, activeMode]);

  const getSortableValue = useCallback((row: any, columnId: string) => {
    const { task, record, mode, step, writeUpDate } = row;
    switch (columnId) {
      case "task_id": return task.id;
      case "applicant": return (task.applicant_name || "").toLowerCase();
      case "company": return (companies.get(task.company_id)?.name || task.company_name || "").toLowerCase();
      case "company_prefix": return (companies.get(task.company_id)?.prefix || "").toLowerCase();
      case "sub_department": return getSubDeptName(task).toLowerCase();
      case "class_name": return getClassName(task).toLowerCase();
      case "write_up_date": {
        const d = parseDateSafe(writeUpDate);
        return d ? d.getTime() : 0;
      }
      case "doc_issue_date": {
        const d = parseDateSafe(row.docIssueDate);
        return d ? d.getTime() : 0;
      }
      case "doc_expiry_date": {
        const d = parseDateSafe(row.docExpiryDate);
        return d ? d.getTime() : 0;
      }
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
  }, [companies, getSubDeptName, getClassName]);

  // First sort level shapes the table's active-column highlight — same shape SummaryTable's
  // sortConfig prop always received, so nothing downstream needs to change.
  const sortConfig = useMemo(() => {
    if (sortLevels.length === 0) return null;
    const first = sortLevels[0];
    return { key: first.key, direction: first.direction as "asc" | "desc" };
  }, [sortLevels]);

  const handleSort = useCallback((columnId: string) => {
    setSortLevels((cur) => {
      if (cur.length > 0 && cur[0].key === columnId) {
        return [{ ...cur[0], direction: cur[0].direction === "asc" ? "desc" : "asc" }];
      }
      return [{ id: crypto.randomUUID(), key: columnId, sortOn: "Cell Values", direction: "asc" }];
    });
  }, []);

  // Multi-level sort — levels apply in priority order (a tie on the first column falls through
  // to the next, and so on), matching the MultiSort dialog's "Initial sort / Then by" model.
  const sortedRows = useMemo(() => {
    if (sortLevels.length === 0) return filteredRows;
    return [...filteredRows].sort((a, b) => {
      for (const level of sortLevels) {
        const av = getSortableValue(a, level.key);
        const bv = getSortableValue(b, level.key);
        if (av < bv) return level.direction === "asc" ? -1 : 1;
        if (av > bv) return level.direction === "asc" ? 1 : -1;
      }
      return 0;
    });
  }, [filteredRows, sortLevels, getSortableValue]);

  // Options the MultiSort dialog offers — every HANDLING_COLUMNS column, keyed by the same ids
  // getSortableValue switches on.
  const multisortColumns = useMemo(() =>
    HANDLING_COLUMNS.map((col) => ({
      value: col.id,
      label: col.label,
      type: (col.id === "task_id" ? "number" : MULTISORT_DATE_COLUMN_IDS.has(col.id) ? "date" : "text") as "text" | "number" | "date",
    })),
    []
  );

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
      const exportRows = sortedRows.map(({ task, record, mode, step, writeUpDate, docIssueDate, docExpiryDate }) => ({
        "Task ID": task.id,
        "Applicant": task.applicant_name || "",
        "Write Up Stage Date": fmtStageDate(writeUpDate) || "",
        "Document Date of Issue": fmtStageDate(docIssueDate) || "",
        "Document Expiry Date": fmtStageDate(docExpiryDate) || "",
        "Company": companies.get(task.company_id)?.name || task.company_name || "",
        "Company Prefix": companies.get(task.company_id)?.prefix || "",
        "Sub-Department": getSubDeptName(task),
        "Class": getClassName(task),
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
  }, [sortedRows, companies, getStaffName, getSubDeptName, getClassName]);

  if (loading) {
    return (
      <div className="flex-1 p-8 bg-white flex items-center justify-center min-h-screen">
        <div className="text-center space-y-4">
          <Loader2 className="h-10 w-10 animate-spin text-slate-400 mx-auto" />
          <p className="text-sm font-medium text-slate-500">Loading Passport Endorsement Tracking...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 overflow-auto bg-white">
      <PageHeader
        dateRange={dateRange}
        setDateRange={setDateRange}
        onRefresh={handleRefresh}
        onExportExcel={handleExportExcel}
        onOpenCouriers={() => setCourierDialogOpen(true)}
        loading={isRefreshing}
        columns={HANDLING_COLUMNS}
        visibleColumnIds={visibleColumnIds}
        setVisibleColumnIds={setVisibleColumnIds}
        onOpenMultiSort={() => setMultiSortOpen(true)}
        sortLevelCount={sortLevels.length}
      />

      <HierarchyTabs
        subDepartments={subDepartments}
        activeSubDeptId={activeSubDeptId}
        setActiveSubDeptId={setActiveSubDeptId}
        subDeptTaskCounts={subDeptTaskCounts}
      />

      <StatusTabs 
        activeStep={activeStep} setActiveStep={setActiveStep} 
        activeMode={activeMode} setActiveMode={setActiveMode}
        counts={counts} 
        searchQuery={searchQuery} setSearchQuery={setSearchQuery}
        availableClasses={availableClasses} activeClassIds={activeClassIds} setActiveClassIds={setActiveClassIds} classCounts={classCounts}
        availableSubClasses={availableSubClasses} activeSubClassIds={activeSubClassIds} setActiveSubClassIds={setActiveSubClassIds} subClassCounts={subClassCounts}
      />

      <StatsRow counts={counts} />

      <HandlingTable
        rows={sortedRows}
        visibleColumnIds={visibleColumnIds}
        getStaffName={getStaffName}
        companies={companies}
        departments={departments}
        subDepartments={subDepartments}
        activeSubDeptId={activeSubDeptId}
        onManage={handleManage}
        sortConfig={sortConfig}
        handleSort={handleSort}
      />

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

      {/* Mounted only while open so initialLevels reseeds from the current sortLevels on every
          open — MultiSort seeds its internal state from initialLevels at mount time only. */}
      {multiSortOpen && (
        <MultiSort
          columns={multisortColumns}
          initialLevels={sortLevels}
          open
          onOpenChange={setMultiSortOpen}
          hideTrigger
          onApply={(levels) => setSortLevels(levels)}
        />
      )}
    </div>
  );
}
