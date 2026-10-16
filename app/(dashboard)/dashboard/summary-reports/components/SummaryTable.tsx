// @ts-nocheck
"use client";

import React, { useMemo, useState, useEffect, useRef, useCallback } from "react";
import { useReactTable, getCoreRowModel, type ColumnDef, type ColumnSizingState } from "@tanstack/react-table";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { SearchX, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ArrowUpDown, ArrowLeftRight, Layers, User, AlertTriangle, Edit, X, RefreshCw, Trash2, ExternalLink, Loader2 } from "lucide-react";
import { differenceInDays } from "date-fns";
import { cn } from "@/lib/utils";
import { formatDateCell, formatEstimatedMins } from "./reportCellRenderers";
import { parseDateSafe } from "../utils/reportStageLogic";
import { getSubDepartmentDisplay, getClassDisplay, getSubClassDisplay, getCompanyPrefixFromParticipants, getSponsorName, getStaffFromParticipants, getEnhancedImmigrationStatus, formatImmigrationDocumentType, formatImmigrationExpiryDate, getRawImmigrationDaysToGo } from "../../tasks/overall-view/tableUtils";
import { getLinkedDocumentsForTaskStage } from "../../tasks/utils/taskManagerData";
import { SUMMARY_COLUMNS, DEFAULT_VISIBLE_SUMMARY_COLUMN_IDS } from "../stageColumnConfig";
import EditableStageCell from "../../tasks/components/EditableStageCell";
import { TableLoadingStateInline } from "@/components/table-loading-state"

const DEFAULT_COL_WIDTH = 170;
const INDEX_COL_WIDTH = 48;
const ACTIONS_COL_WIDTH = 116;
const DELTA_COL_WIDTH = 62;

// Same /dashboard/tasks?deptId=&subDeptId=&taskId= pattern reportCellRenderers.tsx's
// PendingUploadLink uses to jump into DepartmentTasksManager's task list (pre-filtered to
// this one task via its search box) — deliberately NOT /dashboard/tasks/[id] (JobWorkspace).
const buildTaskManagerHref = (task: any): string =>
  `/dashboard/tasks?deptId=${task.department_id ?? ''}&subDeptId=${task.subdepartment_id ?? ''}&taskId=${task.id}`;

export const resolveMilestoneDate = (task: any, stageId: string): string | null => {
  const stageData = task?.stages?.[stageId];
  return stageData?.date || stageData?.completedAt || null;
};

// task.company_name (set by fetchTasks) is matched off participants_details by ROLE only
// ('sponsor' or 'company'), with no check that the participant is actually a company —
// an individual sponsor gets the same role and would show their personal name in a "Company"
// column. This resolver only ever surfaces a name that's confirmed type: 'company', either
// via the authoritative acc_portal_company_duplicate lookup (task.company_id always refers
// to a real company row by definition) or a participants_details/applicant_details entry
// whose own `type` field says 'company'.
export const resolveCompanyName = (task: any, companies: Map<number, any>): string | null => {
  const direct = companies.get(task.company_id)?.name;
  if (direct) return direct;

  const applicant = task.applicant_details;
  if (applicant?.type === 'company') {
    return applicant.name || (applicant.id ? companies.get(Number(applicant.id))?.name : null) || null;
  }

  const participant = task.participants_details?.find((p: any) => p?.type === 'company');
  if (participant) {
    return participant.name || (participant.id ? companies.get(Number(participant.id))?.name : null) || null;
  }

  return null;
};

// `ctx` carries the handful of fields that need more than (task, companies, enhancedTasksData,
// departments) to resolve — staff-name lookups, the canonical current stage, and the
// document-derived immigration status. All optional so existing callers (export, sort) that
// don't pass it still resolve every other field exactly as before; a ctx-dependent field simply
// reads as empty until its caller starts passing the relevant callback.
export interface ResolveFieldValueContext {
  getStaffName?: (userId: any) => string;
  getCurrentStageFollowUpForTask?: (task: any) => string | null;
  getEnhancedStatusForTask?: (task: any) => { date: Date | null; documentType: string | null; daysRemaining: number | null };
  // Officer display names associated with a task (all officers assigned across its
  // officer-follow-up stages) — returns an empty array when none are assigned.
  getOfficersForTask?: (task: any) => string[];
}

export const resolveFieldValue = (colId: string, task: any, companies: Map<number, any>, enhancedTasksData: Map<string, any>, departments: any[] = [], ctx: ResolveFieldValueContext = {}): any => {
  const enhancedTask = enhancedTasksData?.get(task.id?.toString()) || task;
  switch (colId) {
    case 'id': return task.id != null ? String(task.id) : null;
    case 'company': return resolveCompanyName(task, companies);
    case 'applicant': return task.applicant_name || null;
    case 'job_description': return task.job_description || null;
    case 'company_prefix': {
      const v = getCompanyPrefixFromParticipants(task, companies);
      return v && v !== 'N/A' ? v : null;
    }
    case 'sponsor_name': return getSponsorName(task);
    case 'application_type': return enhancedTask.renewal_status || task.renewal_status || null;
    case 'duration': return enhancedTask.duration || task.duration || null;
    case 'subdepartment': {
      const v = getSubDepartmentDisplay(task, departments);
      return v && v !== 'N/A' ? v : null;
    }
    case 'class_name': {
      const v = getClassDisplay(task, departments);
      return v && v !== 'N/A' ? v : null;
    }
    case 'subclass_name': {
      const v = getSubClassDisplay(task, departments);
      return v && v !== 'N/A' ? v : null;
    }
    case 'nationality': return enhancedTask.nationality || null;
    case 'full_name': return enhancedTask.full_name || null;
    case 'age': return enhancedTask.age != null ? String(enhancedTask.age) : null;
    case 'r_number': return enhancedTask.r_number != null ? String(enhancedTask.r_number) : null;
    case 'passport_number': return enhancedTask.passport_number || task.passport_number || null;
    case 'cancellation_reason': return task.cancellation_details?.reason || null;
    case 'cancellation_date': return task.cancellation_details?.cancelled_at
      ? new Date(task.cancellation_details.cancelled_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
      : null;
    case 'cancelled_by': return task.participants_details?.cancelled_by || null;
    case 'task_manager': return ctx.getStaffName ? (getStaffFromParticipants(task, 'task_manager', ctx.getStaffName, departments) || null) : null;
    case 'task_assistant': return ctx.getStaffName ? (getStaffFromParticipants(task, 'task_assistant', ctx.getStaffName, departments) || null) : null;
    case 'officers': {
      if (!ctx.getOfficersForTask) return null;
      const names = ctx.getOfficersForTask(task) || [];
      return names.length > 0 ? names.join(', ') : null;
    }
    case 'current_stage_follow_up': return ctx.getCurrentStageFollowUpForTask ? ctx.getCurrentStageFollowUpForTask(task) : null;
    case 'immigration_document_type': {
      if (!ctx.getEnhancedStatusForTask) return null;
      const v = formatImmigrationDocumentType(task, ctx.getEnhancedStatusForTask);
      return v && v !== '-' ? v : null;
    }
    case 'immigration_expiry_date': {
      if (!ctx.getEnhancedStatusForTask) return null;
      const v = formatImmigrationExpiryDate(task, ctx.getEnhancedStatusForTask);
      return v && v !== '-' ? v : null;
    }
    case 'immigration_days_to_go': {
      if (!ctx.getEnhancedStatusForTask) return null;
      const raw = getRawImmigrationDaysToGo(task, ctx.getEnhancedStatusForTask);
      return raw === '-9999' ? null : raw;
    }
    default: return null;
  }
};

// Mirrors reportCellRenderers.tsx's "Overdue actual time" cell (red text + exceeded badge).
// exceededMinutes is measured against Promised Time, not the stage-derived Expected Time —
// see getActualTimeInfoForTask in page.tsx.
const ActualTimeCell = ({ display, exceededMinutes }: { display: string; exceededMinutes: number }) => (
  <TooltipProvider delayDuration={200}>
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex items-center gap-1 cursor-default select-none">
          <span className="text-sm font-bold text-red-600 tabular-nums">{display}</span>
          <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-red-500 bg-red-50 border border-red-200 rounded px-1 py-0.5">
            <AlertTriangle className="h-2.5 w-2.5" />
            {formatEstimatedMins(exceededMinutes)}
          </span>
        </div>
      </TooltipTrigger>
      <TooltipContent side="top" className="bg-red-50 border-red-200 text-red-900 text-xs shadow-lg rounded-lg px-3 py-2 z-[9999]">
        <p className="font-bold">Exceeds Promised Time</p>
        <p>Over by {formatEstimatedMins(exceededMinutes)}</p>
      </TooltipContent>
    </Tooltip>
  </TooltipProvider>
);

// "Δ vs Promised" cell — Actual Execution minus Promised Time. Red/over-running when
// positive, emerald/ahead-of-schedule when negative, neutral at exactly zero.
const DeltaCell = ({ minutes }: { minutes: number }) => {
  if (minutes === 0) return <span className="text-sm font-semibold text-slate-400">On time</span>;
  const isOver = minutes > 0;
  return (
    <span className={cn("text-sm font-bold tabular-nums", isOver ? "text-red-600" : "text-emerald-600")}>
      {isOver ? '+' : '−'}{formatEstimatedMins(Math.abs(minutes))}
    </span>
  );
};

// Promised Time cell — a dotted-underline hint plus tooltip explaining *why* this task got
// this particular value: two tasks at the same job level can legitimately show different
// Promised Times (different Application Types matching different conditions, or one
// matching a condition while the other falls to the default), and without this the
// difference just looks like a data error.
const PromisedTimeCell = ({ display, resolution }: { display: string; resolution: { source: 'condition' | 'default' | 'none'; applicationType: string | null; matchedValue?: string } }) => (
  <TooltipProvider delayDuration={200}>
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="text-sm font-bold text-amber-800 tabular-nums cursor-default underline decoration-dotted decoration-amber-300 underline-offset-4">
          {display}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="bg-slate-900 text-white border-none text-xs shadow-xl rounded-lg px-3 py-2 z-[9999] max-w-[240px]">
        {resolution.source === 'condition' ? (
          <>
            <p className="font-bold">Condition matched</p>
            <p>Application Type "{resolution.matchedValue}" has its own Promised Time for this job level.</p>
          </>
        ) : (
          <>
            <p className="font-bold">Default Promised Time</p>
            <p>
              {resolution.applicationType
                ? `No condition set for Application Type "${resolution.applicationType}" at this job level — using the default.`
                : "This job level's default Promised Time (no Application Type conditions apply)."}
            </p>
          </>
        )}
      </TooltipContent>
    </Tooltip>
  </TooltipProvider>
);

const PaginationButton = ({ children, onClick, disabled, title }: any) => (
  <Button
    variant="outline"
    size="icon"
    className={cn(
      "h-7 w-7 rounded-md border-slate-200 bg-white text-slate-500 shadow-sm transition-all hover:bg-custom-blue hover:text-white hover:border-custom-blue",
      disabled && "opacity-40 cursor-not-allowed hover:bg-white hover:text-slate-500 hover:border-slate-200"
    )}
    onClick={onClick}
    disabled={disabled}
    title={title}
  >
    {children}
  </Button>
);

// Edit / Cancel(-Reactivate) / Delete — same three actions and icons as
// DepartmentTasksManager's renderActionButtons, just calling back up to page.tsx (which owns
// the tm_tasks writes) instead of mutating a locally-owned tasks list. stopPropagation on each
// button keeps a click here from also firing the row's own navigate-to-task-manager handler.
const RowActionsCell = ({ task, onEditTask, onRequestCancel, onRequestUncancel, onRequestDelete }: any) => (
  <div className="flex items-center justify-center gap-0.5">
    <Button
      variant="ghost"
      size="icon"
      onClick={(e) => { e.stopPropagation(); onEditTask?.(task); }}
      className="h-7 w-7 text-slate-600 hover:bg-slate-100"
      title="Edit Task"
    >
      <Edit className="h-3.5 w-3.5" />
    </Button>

    {task.status === 'cancel' ? (
      <Button
        variant="ghost"
        size="icon"
        onClick={(e) => { e.stopPropagation(); onRequestUncancel?.(task); }}
        className="h-7 w-7 text-green-600 hover:bg-green-100"
        title="Reactivate task"
      >
        <RefreshCw className="h-3.5 w-3.5" />
      </Button>
    ) : (
      <Button
        variant="ghost"
        size="icon"
        onClick={(e) => { e.stopPropagation(); onRequestCancel?.(task); }}
        className="h-7 w-7 text-orange-600 hover:bg-orange-100"
        title="Cancel task"
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    )}

    <Button
      variant="ghost"
      size="icon"
      onClick={(e) => { e.stopPropagation(); onRequestDelete?.(task); }}
      className="h-7 w-7 text-red-600 hover:bg-red-100"
      title="Delete Task"
    >
      <Trash2 className="h-3.5 w-3.5" />
    </Button>
  </div>
);

export function SummaryTable({
  tasks, companies, departments = [],
  activeDeptId = 'all',
  activeSubDeptId = 'all',
  showEmptyGroups = true,
  showTime = false, showDelta = false,
  sortConfig, handleSort,
  enhancedTasksData,
  getExpectedMinutesForTask, getActualTimeInfoForTask,
  getPromisedMinutesForTask, getPromisedTimeResolutionForTask, getPlannedExecutionDateForTask,
  getCurrentStageNameForTask,
  getCurrentStageFollowUpForTask,
  getStaffName,
  getOfficersForTask,
  visibleColumnIds = DEFAULT_VISIBLE_SUMMARY_COLUMN_IDS,
  reportColumnOrder = null,
  reportFieldNumbers = null,
  onEditTask, onRequestCancel, onRequestUncancel, onRequestDelete,
  allDocuments = [],
  kycDocuments = new Map(),
  stagesByDept = new Map(),
  dynamicStageColumns = [],
  getKycFields,
  loading = false,
  personGroupBy,
}: {
  tasks: any[];
  companies: Map<number, { name: string; prefix: string }>;
  departments?: any[];
  activeDeptId?: string;
  activeSubDeptId?: string;
  showEmptyGroups?: boolean;
  showTime?: boolean;
  showDelta?: boolean;
  sortConfig?: { key: string; direction: 'asc' | 'desc' } | null;
  handleSort?: (columnId: string) => void;
  enhancedTasksData?: Map<string, any>;
  getExpectedMinutesForTask?: (task: any) => number;
  getActualTimeInfoForTask?: (task: any) => { diffDays: number; isOverdue: boolean; exceededMinutes: number; promisedMinutes: number | null; deltaMinutes: number | null } | null;
  getPromisedMinutesForTask?: (task: any) => number | null;
  getPromisedTimeResolutionForTask?: (task: any) => { minutes: number | null; source: 'condition' | 'default' | 'none'; applicationType: string | null; matchedValue?: string };
  getPlannedExecutionDateForTask?: (task: any) => Date | null;
  getCurrentStageNameForTask?: (task: any) => string | null;
  getCurrentStageFollowUpForTask?: (task: any) => string | null;
  getStaffName?: (userId: any) => string;
  getOfficersForTask?: (task: any) => string[];
  visibleColumnIds?: string[];
  // The order applyReportToSummaryColumns derived from the applied report's own stored field
  // order (stageColumnConfig.ts) — null when no report is active, in which case columns fall
  // back to SUMMARY_COLUMNS' fixed declaration order as before.
  reportColumnOrder?: string[] | null;
  // columnId -> "1.n"/"2.m" (applyReportToSummaryColumns) — shown next to a column's header
  // label so it can be cross-referenced against MemorizedReportDialog's own ID column for that
  // same field/stage. Null with no report active (or a column not selected by one, e.g. Actions).
  reportFieldNumbers?: Record<string, string> | null;
  onEditTask?: (task: any) => void;
  onRequestCancel?: (task: any) => void;
  onRequestUncancel?: (task: any) => void;
  onRequestDelete?: (task: any) => void;
  dynamicStageColumns?: any[];
  getKycFields?: (doc: any) => Promise<any[]>;
  loading?: boolean;
  // Overrides sub-department section grouping with a person-based grouping (Officers/Managers
  // "All" sub-tabs) — one section per person a task's `getGroupIdsForTask` names, plus an
  // "Unallocated" section for tasks that name none. `groups` gives the canonical section order
  // (same list the perspective's own sub-tabs use); a task can land in more than one section at
  // once (e.g. two officers on the same current stage) since `getGroupIdsForTask` returns an
  // array, mirroring how the perspective tab's own counts already double-count that case.
  personGroupBy?: {
    // "Officer" / "Manager" — names the group kind so the catch-all bucket can read "No Officer
    // Assigned" / "No Manager Assigned" instead of a bare, ambiguous "Unallocated".
    label: string;
    groups: { id: string; name: string }[];
    getGroupIdsForTask: (task: any) => string[];
  };
}) {
  // dynamicStageColumns (built by page.tsx from the applied report's non-milestone stage
  // selections, see stageColumnConfig.ts's 'report_stage' column type) are appended after the
  // static SUMMARY_COLUMNS so a report's arbitrary stage picks get their own columns instead of
  // being silently dropped.
  const columns = useMemo(() => {
    const all = [...SUMMARY_COLUMNS, ...dynamicStageColumns];
    let result: any[];

    if (!reportColumnOrder) {
      result = all.filter(c => visibleColumnIds.includes(c.id));
    } else {
      // A report is active — display its columns in the order applyReportToSummaryColumns
      // derived from the report's own stored field order, not SUMMARY_COLUMNS' fixed
      // declaration order. Anything visible but outside that order (a column toggled on by
      // hand after applying the report) still renders, just appended at the end in its natural
      // position — same as the no-report case.
      const byId = new Map(all.map(c => [c.id, c]));
      const ordered = reportColumnOrder.filter(id => visibleColumnIds.includes(id)).map(id => byId.get(id)).filter(Boolean) as any[];
      const orderedIds = new Set(ordered.map(c => c.id));
      const extras = all.filter(c => visibleColumnIds.includes(c.id) && !orderedIds.has(c.id));
      result = [...ordered, ...extras];
    }

    // stickyColumnOffsets below assumes every `sticky` column sits contiguously at the front —
    // it only accumulates cursor width across sticky columns, so a non-sticky column landing
    // between two sticky ones (a report field order that puts something ahead of Company/
    // Applicant) would make a later sticky column's computed `left` px wrong and detach it
    // from its real on-screen position while scrolling. Partition instead of trusting incoming
    // order: sticky columns first (their relative order preserved), everything else after.
    const sticky = result.filter(c => c.sticky);
    const rest = result.filter(c => !c.sticky);
    return [...sticky, ...rest];
  }, [visibleColumnIds, dynamicStageColumns, reportColumnOrder]);
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>({});
  const [pendingRedirectTask, setPendingRedirectTask] = useState<any>(null);

  // Stages lookup for EditableStageCell in milestone columns
  const tasksStagesByDept = stagesByDept;

  // Backs the immigration_document_type/immigration_expiry_date/immigration_days_to_go
  // columns — same getEnhancedImmigrationStatus DepartmentTasksManager's own
  // getEnhancedImmigrationStatusWrapper calls, built here instead of threaded down as a prop
  // since allDocuments/kycDocuments/stagesByDept are already available on this component.
  const getEnhancedStatusForTask = useCallback((task: any) => {
    const stageList = tasksStagesByDept.get(task.department_id?.toString()) || [];
    return getEnhancedImmigrationStatus(task, stageList, allDocuments, kycDocuments);
  }, [tasksStagesByDept, allDocuments, kycDocuments]);

  const fieldValueCtx: ResolveFieldValueContext = { getStaffName, getCurrentStageFollowUpForTask, getEnhancedStatusForTask, getOfficersForTask };

  // Group (sub-department) headers pin directly beneath the sticky column header instead of
  // just being a divider line — measured (not hardcoded) so it stays correct if the header
  // row's height ever changes (column label wrapping, font tweaks, etc.).
  const headerRowRef = useRef<HTMLTableRowElement>(null);
  const refNumberRowRef = useRef<HTMLTableRowElement>(null);
  const expectedTimeRowRef = useRef<HTMLTableRowElement>(null);
  const [groupHeaderTop, setGroupHeaderTop] = useState(40);
  useEffect(() => {
    const measure = () => {
      const h = (headerRowRef.current?.getBoundingClientRect().height || 0)
        + (refNumberRowRef.current?.getBoundingClientRect().height || 0)
        + (expectedTimeRowRef.current?.getBoundingClientRect().height || 0);
      if (h) setGroupHeaderTop(h);
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [columns.length, reportFieldNumbers]);

  // Every stage's own configured "estimated_time" (Departments → Stages), looked up once
  // across every department's stage list — resolved into a colId->minutes map so the
  // Expected Time header row below can show it without a per-column lookup on every render.
  const stageEstimatedTimeByColId = useMemo(() => {
    const allStages = Array.from(tasksStagesByDept.values()).flat();
    const map: Record<string, number> = {};
    columns.forEach((col: any) => {
      const stageId = col.type === 'milestone' ? col.milestone?.stageId : col.type === 'report_stage_info' ? col.reportStageInfo?.stageId : null;
      if (!stageId) return;
      const stage = allStages.find((s: any) => s.id === stageId);
      if (stage?.estimated_time) map[col.id] = stage.estimated_time;
    });
    return map;
  }, [columns, tasksStagesByDept]);

  // ── Column sizing (tanstack react-table, resizable columns) ──
  const columnDefs = useMemo<ColumnDef<any>[]>(() => [
    { id: '__index__', size: INDEX_COL_WIDTH, enableResizing: false },
    ...columns.map((col: any) => ({ id: col.id, size: DEFAULT_COL_WIDTH, minSize: 90, maxSize: 640 })),
    { id: '__actions__', size: ACTIONS_COL_WIDTH, enableResizing: false },
  ], [columns]);

  const table = useReactTable({
    data: [],
    columns: columnDefs,
    columnResizeMode: 'onChange',
    state: { columnSizing },
    onColumnSizingChange: setColumnSizing,
    getCoreRowModel: getCoreRowModel(),
  });

  const getColWidth = (colId: string): number => table.getColumn(colId)?.getSize() ?? DEFAULT_COL_WIDTH;

  const applyWidthToAllColumns = (colId: string) => {
    const width = getColWidth(colId);
    setColumnSizing(prev => {
      const next = { ...prev };
      columns.forEach((c: any) => { next[c.id] = width; });
      return next;
    });
  };

  const headerById: Record<string, any> = {};
  table.getHeaderGroups().forEach(hg => hg.headers.forEach(h => { headerById[h.id] = h; }));

  const stickyColumnOffsets = useMemo(() => {
    const offsets: Record<string, number> = {};
    let cursor = INDEX_COL_WIDTH;
    columns.forEach((col: any) => {
      if (col.sticky) {
        offsets[col.id] = cursor;
        cursor += columnSizing[col.id] ?? DEFAULT_COL_WIDTH;
      }
    });
    return offsets;
  }, [columns, columnSizing]);

  // ── Δ columns between consecutive milestone columns ──
  // A "dated stage column" is anything with its own resolved date in milestoneDates/
  // milestoneDateObjs — every milestone and every report_stage_info column now qualify, since
  // both always render their stage's actual completion date via EditableStageCell (a
  // report_stage_info column selected for document fields only still shows that stage's real
  // date if one exists — see renderReportStageInfoCell). dateKey is the key that date is
  // stored under in those maps.
  const isDatedStageCol = (col: any): boolean => col.type === 'milestone' || col.type === 'report_stage_info';
  const dateKeyFor = (col: any): string => col.type === 'milestone' ? col.milestone.key : col.id;

  const interleavedColumns = useMemo(() => {
    if (!showDelta) return columns;
    const result: any[] = [];
    const priorDatedCols: any[] = [];
    columns.forEach((col: any, i: number) => {
      result.push(col);
      if (isDatedStageCol(col)) priorDatedCols.push(col);
      const next = columns[i + 1];
      if (isDatedStageCol(col) && next && isDatedStageCol(next)) {
        result.push({ id: `__delta__${i}`, isDelta: true, prevCol: col, nextCol: next, priorCols: [...priorDatedCols], label: 'Δ' });
      }
    });
    return result;
  }, [columns, showDelta]);

  const firstHighlightId = useMemo(() => columns.find(c => c.highlight)?.id, [columns]);

  const rows = useMemo(() => tasks.map(task => {
    const milestoneDates: Record<string, string | null> = {};
    const milestoneDateObjs: Record<string, Date | null> = {};
    columns.forEach(col => {
      if (col.type === 'milestone') {
        const raw = resolveMilestoneDate(task, col.milestone.stageId);
        milestoneDates[col.milestone.key] = raw;
        milestoneDateObjs[col.milestone.key] = raw ? parseDateSafe(raw) : null;
      } else if (col.type === 'report_stage_info') {
        const raw = resolveMilestoneDate(task, col.reportStageInfo.stageId);
        milestoneDates[col.id] = raw;
        milestoneDateObjs[col.id] = raw ? parseDateSafe(raw) : null;
      }
    });
    return { task, milestoneDates, milestoneDateObjs };
  }), [tasks, columns]);

  const totalPages = Math.max(1, Math.ceil(rows.length / rowsPerPage));
  useEffect(() => { if (currentPage > totalPages) setCurrentPage(totalPages); }, [currentPage, totalPages]);

  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * rowsPerPage;
    return rows.slice(start, start + rowsPerPage);
  }, [rows, currentPage, rowsPerPage]);

  // Page-number window for the pagination bar — always keeps the first/last page visible and
  // collapses a large page count to a sliding window of ~5 around the current page, joined by
  // ellipses. Degenerates to every page in order when totalPages is small.
  const pageItems = (() => {
    const items: (number | 'ellipsis')[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) items.push(i);
      return items;
    }
    items.push(1);
    const start = Math.max(2, currentPage - 1);
    const end = Math.min(totalPages - 1, currentPage + 1);
    if (start > 2) items.push('ellipsis');
    for (let i = start; i <= end; i++) items.push(i);
    if (end < totalPages - 1) items.push('ellipsis');
    items.push(totalPages);
    return items;
  })();

  // Canonical section order — the same order the Sub-Department tabs (HierarchyTabs) show,
  // i.e. each department's tm_subdepartments in their stored `order`. Scoped to the active
  // department when one is selected; flattened across every department (in department order)
  // for "All Departments", deduped by name since that's also how grouping keys rows.
  const orderedSubDeptNames = useMemo(() => {
    const names: string[] = [];
    const seen = new Set<string>();
    const addDept = (dept: any) => {
      (dept?.tm_subdepartments || []).forEach((s: any) => {
        const name = s?.name || 'N/A';
        if (!seen.has(name)) { seen.add(name); names.push(name); }
      });
    };
    if (activeDeptId && activeDeptId !== 'all') {
      addDept(departments.find((d: any) => d.id.toString() === activeDeptId));
    } else {
      departments.forEach((d: any) => addDept(d));
    }
    return names;
  }, [departments, activeDeptId]);

  // Per-subdepartment totals across the FULL filtered set (not just the current page) — lets
  // us tell "genuinely no tasks anywhere" (render a "No tasks associated" placeholder, stable
  // across every page) apart from "has tasks, just none on this particular page" (render
  // nothing here rather than a misleading empty section).
  const subDeptTotalCounts = useMemo(() => {
    const counts = new Map<string, number>();
    rows.forEach(r => {
      const name = getSubDepartmentDisplay(r.task, departments);
      counts.set(name, (counts.get(name) || 0) + 1);
    });
    return counts;
  }, [rows, departments]);

  // ── Subdepartment section grouping (current page's rows, ordered per the tabs) ──
  const subDeptGroups = useMemo(() => {
    const map = new Map<string, typeof paginatedRows>();
    for (const row of paginatedRows) {
      const name = getSubDepartmentDisplay(row.task, departments);
      if (!map.has(name)) map.set(name, []);
      map.get(name)!.push(row);
    }

    const ordered: { name: string; rows: typeof paginatedRows }[] = [];
    const consumed = new Set<string>();

    orderedSubDeptNames.forEach(name => {
      consumed.add(name);
      if (map.has(name)) {
        ordered.push({ name, rows: map.get(name)! });
      } else if (showEmptyGroups && (subDeptTotalCounts.get(name) || 0) === 0) {
        ordered.push({ name, rows: [] });
      }
      // else: has tasks overall, just none landed on this page — no section here.
    });

    // Anything not covered by the canonical tab order (e.g. department-level tasks with no
    // sub-department) — same trailing behavior as before, N/A last.
    const leftoverNames = Array.from(map.keys()).filter(n => !consumed.has(n));
    leftoverNames.sort((a, b) => (a === 'N/A' ? 1 : b === 'N/A' ? -1 : a.localeCompare(b)));
    leftoverNames.forEach(name => ordered.push({ name, rows: map.get(name)! }));

    return ordered;
  }, [paginatedRows, departments, orderedSubDeptNames, subDeptTotalCounts, showEmptyGroups]);

  type SectionedItem =
    | { type: 'section'; name: string; count: number }
    | { type: 'subsection'; name: string; count: number }
    | { type: 'empty'; name: string }
    | { type: 'row'; row: any; globalIdx: number };

  const sectionedRows = useMemo(() => {
    // Splits `rowsForGroup` into person (Officer/Manager) sub-sections nested WITHIN a
    // sub-department section — never instead of it (see personGroupBy's own prop comment: it
    // adds a second grouping level, it doesn't replace the first). A group with zero rows here
    // is simply omitted rather than shown as an empty placeholder — the officer/manager list
    // can be much longer than the sub-department list, and an empty section for every
    // uninvolved person would be mostly noise. `startIdx` threads the same running row-number/
    // striping counter across every section boundary, same as the flat case below.
    const buildPersonSubsections = (rowsForGroup: typeof paginatedRows, startIdx: number): { items: SectionedItem[]; nextIdx: number } => {
      const UNALLOCATED = '__unallocated__';
      const map = new Map<string, typeof paginatedRows>();
      rowsForGroup.forEach(row => {
        const ids = personGroupBy!.getGroupIdsForTask(row.task);
        const keys = ids.length > 0 ? ids : [UNALLOCATED];
        keys.forEach(id => { if (!map.has(id)) map.set(id, []); map.get(id)!.push(row); });
      });
      const items: SectionedItem[] = [];
      let idx = startIdx;
      const pushGroup = (name: string, groupRows: typeof paginatedRows) => {
        items.push({ type: 'subsection', name, count: groupRows.length });
        groupRows.forEach(row => { items.push({ type: 'row', row, globalIdx: idx }); idx++; });
      };
      personGroupBy!.groups.forEach(g => {
        const groupRows = map.get(g.id);
        if (groupRows && groupRows.length > 0) pushGroup(g.name, groupRows);
      });
      const unallocated = map.get(UNALLOCATED);
      if (unallocated && unallocated.length > 0) pushGroup(`No ${personGroupBy!.label} Assigned`, unallocated);
      return { items, nextIdx: idx };
    };

    if (personGroupBy && activeSubDeptId && activeSubDeptId !== 'all') {
      // A specific sub-department is already selected — its own header would be redundant
      // (same reasoning as the no-person-grouping case below), so nest person sub-sections
      // directly under a flat top-level list instead of a further sub-department header.
      return buildPersonSubsections(paginatedRows, 0).items;
    }

    if (personGroupBy) {
      // "All" sub-departments — outer sections stay sub-department (identical order/empty-
      // placeholder rules to the plain case below), each one's rows further split into person
      // sub-sections.
      const result: SectionedItem[] = [];
      let globalIdx = 0;
      for (const group of subDeptGroups) {
        result.push({ type: 'section', name: group.name, count: group.rows.length });
        if (group.rows.length === 0) {
          result.push({ type: 'empty', name: group.name });
        } else {
          const { items, nextIdx } = buildPersonSubsections(group.rows, globalIdx);
          result.push(...items);
          globalIdx = nextIdx;
        }
      }
      return result;
    }

    // When a specific sub-department is selected, skip section grouping entirely — just
    // render a flat list of rows. The user already filtered to this sub-department via the
    // tab, so showing a section header for it is redundant.
    if (activeSubDeptId && activeSubDeptId !== 'all') {
      return paginatedRows.map((row, i) => ({ type: 'row' as const, row, globalIdx: i }));
    }

    const result: SectionedItem[] = [];
    let globalIdx = 0;
    for (const group of subDeptGroups) {
      result.push({ type: 'section', name: group.name, count: group.rows.length });
      if (group.rows.length === 0) {
        result.push({ type: 'empty', name: group.name });
      } else {
        for (const row of group.rows) { result.push({ type: 'row', row, globalIdx }); globalIdx++; }
      }
    }
    return result;
  }, [personGroupBy, subDeptGroups, activeSubDeptId, paginatedRows]);

  // Renders a 'report_stage_info' cell — always through EditableStageCell, same as every other
  // stage cell in this table, regardless of whether the report selected this stage's own
  // "Stage Completion Date" or only document fields under it. Previously this also rendered
  // the report's selected document field values as bare extracted text underneath — dropped
  // because it produced a confusing second, differently-styled "date" whenever the selected
  // field happened to itself be a date (the field value and EditableStageCell's own resolved
  // date showing side by side with no indication they were the same thing). Everything about
  // a stage's document now goes through EditableStageCell's own resolution/preview instead.
  const renderReportStageInfoCell = (col: any, task: any): React.ReactNode => {
    const { stageId } = col.reportStageInfo;
    const stageList = tasksStagesByDept.get(task.department_id?.toString()) || [];
    const stage = stageList.find((s: any) => s.id === stageId) || { id: stageId };
    const linkedDocs = getLinkedDocumentsForTaskStage(task, stage, allDocuments);
    const stageData = task.stages?.[stage.id];
    const cellValue = stageData?.date || stageData?.completedAt || stageData?.status || null;

    return (
      <EditableStageCell
        stage={stage}
        stages={stageList}
        task={task}
        value={cellValue}
        allDocuments={allDocuments}
        linkedDocuments={linkedDocs}
        departments={departments}
        getKycFields={getKycFields}
        readOnly={true}
        renderMode="combined"
        showTime={showTime}
        previewOnly={true}
      />
    );
  };

  const resolveCellValue = (col: any, task: any): React.ReactNode => {
    if (col.id === 'current_stage') return getCurrentStageNameForTask?.(task) ?? null;
    // Same red/amber/green urgency coloring as DepartmentTasksManager's own days-remaining
    // column (formatImmigrationDaysToGo) — resolveFieldValue itself stays plain-text since
    // sort/export also read through it and shouldn't get a ReactNode back.
    if (col.id === 'immigration_days_to_go') {
      const raw = resolveFieldValue(col.id, task, companies, enhancedTasksData, departments, fieldValueCtx);
      if (raw == null) return null;
      const days = Number(raw);
      return <span className={cn("font-medium", days < 0 ? 'text-red-600' : days <= 30 ? 'text-amber-600' : 'text-green-600')}>{days} days</span>;
    }
    if (col.type === 'field') return resolveFieldValue(col.id, task, companies, enhancedTasksData, departments, fieldValueCtx);
    if (col.type === 'computed_time') {
      if (col.id === 'promised_time') {
        const resolution = getPromisedTimeResolutionForTask?.(task);
        if (!resolution?.minutes) return null;
        return <PromisedTimeCell display={formatEstimatedMins(resolution.minutes)} resolution={resolution} />;
      }
      if (col.id === 'planned_execution') {
        const date = getPlannedExecutionDateForTask?.(task);
        return date ? formatDateCell(date.toISOString(), showTime) : null;
      }
      if (col.id === 'actual_execution') {
        const info = getActualTimeInfoForTask?.(task);
        if (!info) return null;
        const display = `${info.diffDays}d`;
        return info.isOverdue ? <ActualTimeCell display={display} exceededMinutes={info.exceededMinutes} /> : display;
      }
      if (col.id === 'execution_delta') {
        const info = getActualTimeInfoForTask?.(task);
        if (!info || info.deltaMinutes == null) return null;
        return <DeltaCell minutes={info.deltaMinutes} />;
      }
      if (col.id === 'stages_time_expected') {
        const minutes = getExpectedMinutesForTask?.(task) ?? 0;
        return minutes > 0 ? formatEstimatedMins(minutes) : null;
      }
    }
    return null;
  };

  return (
    <div className="flex flex-col flex-1 antialiased bg-slate-50 px-6">
      <div className="relative overflow-hidden rounded-xl border border-slate-200 shadow-sm">
        <div className="overflow-auto max-h-[calc(100vh-280px)] custom-scrollbar">
          <Table className="border-separate border-spacing-0 table-fixed" style={{ width: table.getTotalSize(), minWidth: '100%' }}>
            <colgroup>
              <col style={{ width: INDEX_COL_WIDTH }} />
              {interleavedColumns.map((col: any) => (
                <col key={col.id} style={{ width: col.isDelta ? DELTA_COL_WIDTH : getColWidth(col.id) }} />
              ))}
              <col style={{ width: ACTIONS_COL_WIDTH }} />
            </colgroup>

            <TableHeader className="sticky top-0 z-40">
              {/* Reference # — the "1.n"/"2.m" number applyReportToSummaryColumns assigned this
                  column (see reportFieldNumbers), on its own row above the label so it's visible
                  without crowding the label below. Cross-references the same number Report
                  Manager's own ID column shows for that field/stage. Only rendered while a
                  report that actually produced numbers is applied. */}
              {reportFieldNumbers && Object.keys(reportFieldNumbers).length > 0 && (
                <TableRow ref={refNumberRowRef} className="hover:bg-transparent border-0" style={{ backgroundColor: '#2a5486' }}>
                  <TableHead className="sticky left-0 z-50 h-5 border-r border-b border-white/30 text-center py-0 px-2" style={{ backgroundColor: '#2a5486' }} />
                  {interleavedColumns.map((col: any) => {
                    if (col.isDelta) {
                      return <TableHead key={col.id} className="h-5 border-r border-b border-white/30 py-0" style={{ width: DELTA_COL_WIDTH, backgroundColor: '#2a5486' }} />;
                    }
                    const isSticky = !!col.sticky;
                    const left = isSticky ? stickyColumnOffsets[col.id] : undefined;
                    const number = reportFieldNumbers[col.id];
                    return (
                      <TableHead
                        key={col.id}
                        className={cn(
                          "h-5 border-r border-b border-white/30 text-center py-0 px-2",
                          isSticky && "z-40 sticky"
                        )}
                        style={{ backgroundColor: '#2a5486', ...(isSticky ? { left: `${left}px` } : {}) }}
                      >
                        {number ? (
                          <span className="text-[10px] font-black text-white tabular-nums leading-none" title="Reference number — matches the ID column in Report Manager">
                            {number}
                          </span>
                        ) : null}
                      </TableHead>
                    );
                  })}
                  <TableHead className="sticky right-0 z-50 h-5 border-l border-b border-white/30 py-0 shadow-[-2px_0_4px_rgba(0,0,0,0.15)]" style={{ backgroundColor: '#2a5486' }} />
                </TableRow>
              )}

              <TableRow ref={headerRowRef} className="hover:bg-transparent border-0">
                <TableHead className="sticky left-0 z-50 border-r border-b border-white/30 text-center py-1 px-2 bg-custom-blue">
                  <span className="text-[10px] font-semibold text-white uppercase tracking-wider">#</span>
                </TableHead>

                {interleavedColumns.map((col: any) => {
                  if (col.isDelta) {
                    return (
                      <TableHead key={col.id} className="border-r border-b border-white/30 text-center px-1 py-0.5 bg-custom-blue" style={{ width: DELTA_COL_WIDTH }}>
                        <TooltipProvider delayDuration={300}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="text-[10px] font-black text-amber-300/90 uppercase tracking-wide cursor-default bg-white/10 px-1.5 py-0.5 rounded">Δ</span>
                            </TooltipTrigger>
                            <TooltipContent side="bottom" className="bg-slate-900 text-white border-none shadow-xl text-xs rounded-lg px-3 py-2 z-[9999] max-w-[200px]">
                              Days between stages
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </TableHead>
                    );
                  }

                  const isSticky = !!col.sticky;
                  const left = isSticky ? stickyColumnOffsets[col.id] : undefined;
                  const isActive = sortConfig?.key === col.id;

                  return (
                    <TableHead
                      key={col.id}
                      onClick={() => handleSort?.(col.id)}
                      className={cn(
                        "group relative border-r border-b border-white/30 transition-colors select-none px-4 py-0.5",
                        handleSort && "cursor-pointer",
                        col.highlight ? "bg-amber-500 hover:bg-amber-600" : col.type === 'computed_time' ? "bg-violet-600 hover:bg-violet-700" : "bg-custom-blue hover:bg-slate-700",
                        isSticky && "z-40 sticky shadow-[2px_0_4px_rgba(0,0,0,0.15)]",
                        isActive && !col.highlight && col.type !== 'computed_time' && "bg-slate-700",
                        col.id === firstHighlightId && "border-l-[3px] border-l-amber-300"
                      )}
                      style={isSticky ? { left: `${left}px` } : undefined}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <TooltipProvider delayDuration={500}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="text-[10px] font-semibold uppercase tracking-wider text-white whitespace-normal break-words leading-tight">
                                {col.label}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="bottom" className="bg-slate-900 text-white border-none shadow-xl text-xs rounded-lg px-3 py-2 z-[9999] max-w-[260px] break-words">
                              {col.milestone?.description || col.label}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>

                        <div className="flex items-center gap-1.5">
                          <TooltipProvider delayDuration={300}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  onMouseDown={(e) => e.stopPropagation()}
                                  onClick={(e) => { e.stopPropagation(); applyWidthToAllColumns(col.id); }}
                                  className="h-4 w-4 shrink-0 flex items-center justify-center rounded text-white/40 hover:text-white hover:bg-slate-600 opacity-0 group-hover:opacity-100 transition-all"
                                >
                                  <ArrowLeftRight size={10} strokeWidth={2.5} />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent side="bottom" className="bg-slate-900 text-white border-none shadow-xl text-xs rounded-lg px-3 py-2 z-[9999]">
                                Apply this column's width to all columns
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                          {handleSort && <ArrowUpDown className={cn("h-3 w-3 shrink-0", isActive ? "text-white" : "text-white/40 opacity-0 group-hover:opacity-100")} />}
                        </div>
                      </div>

                      <div
                        onMouseDown={(e) => { e.stopPropagation(); headerById[col.id]?.getResizeHandler()(e); }}
                        onTouchStart={(e) => { e.stopPropagation(); headerById[col.id]?.getResizeHandler()(e); }}
                        onClick={(e) => e.stopPropagation()}
                        className={cn(
                          "absolute inset-y-0 right-0 w-2 cursor-col-resize touch-none select-none transition-colors",
                          headerById[col.id]?.column.getIsResizing() ? "bg-blue-300" : "hover:bg-white/30"
                        )}
                      />
                    </TableHead>
                  );
                })}

                <TableHead
                  className="sticky right-0 z-50 border-l border-b border-white/30 text-center py-1.5 px-2 bg-custom-blue shadow-[-2px_0_4px_rgba(0,0,0,0.15)]"
                >
                  <span className="text-[10px] font-semibold text-white uppercase tracking-wider">Actions</span>
                </TableHead>
              </TableRow>

              {/* Expected Time — each stage's own configured estimated_time (Departments →
                  Stages), shown once per stage column instead of buried in a tooltip only
                  visible on hover over a completed/in-progress cell. */}
              {Object.keys(stageEstimatedTimeByColId).length > 0 && (
                <TableRow ref={expectedTimeRowRef} className="hover:bg-transparent border-0" style={{ backgroundColor: '#2a5486' }}>
                  <TableHead className="sticky left-0 z-50 h-5 border-r border-b border-white/30 text-center py-0 px-2" style={{ backgroundColor: '#2a5486' }} />
                  {interleavedColumns.map((col: any) => {
                    if (col.isDelta) {
                      return <TableHead key={col.id} className="h-5 border-r border-b border-white/30 py-0" style={{ width: DELTA_COL_WIDTH, backgroundColor: '#2a5486' }} />;
                    }
                    const isSticky = !!col.sticky;
                    const left = isSticky ? stickyColumnOffsets[col.id] : undefined;
                    const minutes = stageEstimatedTimeByColId[col.id];
                    return (
                      <TableHead
                        key={col.id}
                        className={cn(
                          "h-5 border-r border-b border-white/30 text-center py-0 px-2",
                          isSticky && "z-40 sticky"
                        )}
                        style={{ backgroundColor: '#2a5486', ...(isSticky ? { left: `${left}px` } : {}) }}
                      >
                        {minutes ? (
                          <span className="text-[10px] font-semibold text-white tabular-nums whitespace-nowrap leading-none">
                            Expected: {formatEstimatedMins(minutes)}
                          </span>
                        ) : null}
                      </TableHead>
                    );
                  })}
                  <TableHead className="sticky right-0 z-50 h-5 border-l border-b border-white/30 py-0 shadow-[-2px_0_4px_rgba(0,0,0,0.15)]" style={{ backgroundColor: '#2a5486' }} />
                </TableRow>
              )}
            </TableHeader>

            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={interleavedColumns.length + 2} className="h-64 bg-slate-50 p-0">
                    <TableLoadingStateInline />
                  </TableCell>
                </TableRow>
              ) : sectionedRows.length > 0 ? (
                sectionedRows.map((item, itemIdx) => {
                  if (item.type === 'section') {
                    // The name/count cell must NOT span every column if it's going to stay
                    // pinned on horizontal scroll — a full-width sticky cell would cover the
                    // whole table. Instead the sticky block spans just the index + sticky
                    // data columns (same widths the data rows' sticky cells occupy), so the
                    // group header's Layers icon, sub-department name and count all stay
                    // visible while the rest of the row scrolls underneath.
                    const stickyColCount = columns.filter((c: any) => c.sticky).length;
                    const headerSpacerColSpan = Math.max(1, interleavedColumns.length - stickyColCount);
                    return (
                      <TableRow key={`section-${itemIdx}-${item.name}`} className="border-0 hover:bg-transparent">
                        <TableCell
                          colSpan={1 + stickyColCount}
                          className="sticky left-0 z-40 bg-blue-50 border-r border-t-2 border-t-custom-blue border-b border-b-slate-200 py-2 pl-3 pr-4"
                          style={{ top: groupHeaderTop }}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <Layers className="h-3 w-3 text-custom-blue/60 shrink-0" />
                            <span className="text-[11px] font-bold uppercase tracking-wider text-custom-blue whitespace-nowrap">
                              {item.name === 'N/A' ? 'Unassigned' : item.name}
                            </span>
                            <span className="text-[11px] font-semibold text-slate-400 tabular-nums whitespace-nowrap">
                              · {item.count}
                            </span>
                          </div>
                        </TableCell>
                        {/* Sticky only vertically (top, no left/right) so the row's border/background
                            stays continuous under the header on vertical scroll. Kept at a lower
                            z-index than the name cell above — both are `position: sticky` siblings,
                            and without that gap this cell (which slides normally on horizontal
                            scroll, unlike the pinned name cell) paints over and visually erases the
                            name cell as you scroll right, since equal z-index ties resolve in DOM
                            order and this cell comes second. */}
                        <TableCell
                          colSpan={headerSpacerColSpan}
                          className="sticky z-30 bg-blue-50 px-4 py-2 border-t-2 border-t-custom-blue border-b border-b-slate-200"
                          style={{ top: groupHeaderTop }}
                        />
                        <TableCell
                          className="sticky right-0 z-30 bg-blue-50 border-l border-t-2 border-t-custom-blue border-b border-b-slate-200 py-2 px-2"
                          style={{ top: groupHeaderTop }}
                        />
                      </TableRow>
                    );
                  }

                  if (item.type === 'subsection') {
                    // Same sticky-span mechanics as the sub-department section header above,
                    // just visually one level down (indented, indigo instead of blue, a person
                    // icon instead of Layers) — this always sits nested inside a sub-department
                    // section, never as a top-level header on its own. Indigo is deliberately a
                    // third, distinct tone: blue is already the sub-department header and
                    // white/slate-50 is already the zebra-striped task rows, so re-using either
                    // here would make this level blend into one of those instead of reading as
                    // its own thing.
                    const stickyColCount = columns.filter((c: any) => c.sticky).length;
                    const headerSpacerColSpan = Math.max(1, interleavedColumns.length - stickyColCount);
                    return (
                      <TableRow key={`subsection-${itemIdx}-${item.name}`} className="border-0 hover:bg-transparent">
                        <TableCell
                          colSpan={1 + stickyColCount}
                          className="sticky left-0 z-40 bg-indigo-50 border-r border-t border-t-indigo-300 border-b border-b-slate-200 py-1.5 pl-8 pr-4"
                          style={{ top: groupHeaderTop }}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <User className="h-3 w-3 text-indigo-400 shrink-0" />
                            <span className="text-[10.5px] font-bold uppercase tracking-wider text-indigo-700 whitespace-nowrap">
                              {item.name}
                            </span>
                            <span className="text-[10.5px] font-semibold text-indigo-400 tabular-nums whitespace-nowrap">
                              · {item.count}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell
                          colSpan={headerSpacerColSpan}
                          className="sticky z-30 bg-indigo-50 px-4 py-1.5 border-t border-t-indigo-300 border-b border-b-slate-200"
                          style={{ top: groupHeaderTop }}
                        />
                        <TableCell
                          className="sticky right-0 z-30 bg-indigo-50 border-l border-t border-t-indigo-300 border-b border-b-slate-200 py-1.5 px-2"
                          style={{ top: groupHeaderTop }}
                        />
                      </TableRow>
                    );
                  }

                  if (item.type === 'empty') {
                    // Same sticky-span trick as the section header above — the "No tasks
                    // associated" message must stay pinned with the index + sticky data
                    // columns on horizontal scroll instead of scrolling away with the rest.
                    const stickyColCount = columns.filter((c: any) => c.sticky).length;
                    const spacerColSpan = Math.max(1, interleavedColumns.length - stickyColCount);
                    return (
                      <TableRow key={`empty-${itemIdx}-${item.name}`} className="border-0 hover:bg-transparent">
                        <TableCell
                          colSpan={1 + stickyColCount}
                          className="sticky left-0 z-20 bg-slate-50 border-r border-b border-slate-200 py-3 px-4"
                        >
                          <span className="text-sm italic text-slate-400">No tasks associated</span>
                        </TableCell>
                        <TableCell colSpan={spacerColSpan} className="bg-slate-50 border-b border-slate-200 py-3" />
                        <TableCell className="sticky right-0 z-20 bg-slate-50 border-l border-b border-slate-200 py-3 px-2" />
                      </TableRow>
                    );
                  }

                  const { task, milestoneDates, milestoneDateObjs } = item.row;
                  const idx = item.globalIdx;

                  return (
                    <TableRow
                      key={task.id}
                      className={cn("group border-0 transition-colors cursor-pointer", idx % 2 === 0 ? "bg-white" : "bg-slate-50", "hover:bg-blue-50/50")}
                      onClick={() => setPendingRedirectTask(task)}
                    >
                      <TableCell className={cn("sticky left-0 z-20 border-r border-b border-slate-200 text-center py-2.5", idx % 2 === 0 ? "bg-white" : "bg-slate-50", "group-hover:bg-blue-50")}>
                        <span className="text-sm font-semibold text-slate-400 group-hover:text-slate-600 transition-colors">
                          {((currentPage - 1) * rowsPerPage) + idx + 1}
                        </span>
                      </TableCell>

                      {interleavedColumns.map((col: any) => {
                        // ── Δ cell ──
                        if (col.isDelta) {
                          const nextDate = milestoneDateObjs[dateKeyFor(col.nextCol)];
                          let prevDate: Date | null = null;
                          let bridgedFromCol: any = col.prevCol;
                          if (nextDate) {
                            for (let i = col.priorCols.length - 1; i >= 0; i--) {
                              const candidate = col.priorCols[i];
                              const d = milestoneDateObjs[dateKeyFor(candidate)];
                              if (d) { prevDate = d; bridgedFromCol = candidate; break; }
                            }
                          }
                          const diff = prevDate && nextDate ? differenceInDays(nextDate, prevDate) : null;
                          const bridged = diff !== null && bridgedFromCol?.id !== col.prevCol?.id;
                          return (
                            <TableCell
                              key={col.id}
                              className={cn(
                                "px-1 py-2.5 border-r border-b border-slate-100 text-center border-l-[3px] border-l-amber-300/40",
                                idx % 2 === 0 ? "bg-white" : "bg-slate-50",
                                "group-hover:bg-blue-50/50"
                              )}
                            >
                              {diff !== null ? (
                                <TooltipProvider delayDuration={200}>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <span className={cn(
                                        "text-sm font-bold tabular-nums cursor-default",
                                        bridged && "italic underline decoration-dotted",
                                        diff < 0 ? "text-red-600" : diff > 30 ? "text-rose-500" : diff > 14 ? "text-amber-500" : "text-slate-500"
                                      )}>
                                        {diff >= 0 ? `+${diff}d` : `${diff}d`}
                                      </span>
                                    </TooltipTrigger>
                                    <TooltipContent side="top" className="bg-slate-900 text-white text-xs rounded-lg px-2 py-1.5 z-[9999]">
                                      {bridged
                                        ? `${diff} day${Math.abs(diff) !== 1 ? "s" : ""} since ${bridgedFromCol?.label} — ${col.prevCol?.label} has no date yet`
                                        : `${diff} day${Math.abs(diff) !== 1 ? "s" : ""} between milestones`}
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              ) : (
                                <span className="text-slate-200 text-sm">—</span>
                              )}
                            </TableCell>
                          );
                        }

                        const isSticky = !!col.sticky;
                        const left = isSticky ? stickyColumnOffsets[col.id] : undefined;
                        let value: React.ReactNode;
                        if (col.type === 'milestone' && col.milestone) {
                          // Always render through EditableStageCell — no plain-text fallback —
                          // so a stage cell looks and behaves identically whether or not the
                          // full stage definition was found for this task's department (a stub
                          // {id} still gets EditableStageCell's icons/LATE badge/MISSING
                          // styling; it just can't compute overdue/lock without stage.
                          // estimated_time/dependencies). This is also the only path
                          // DepartmentTasksManager uses, so both modules render identically.
                          const stageList = tasksStagesByDept.get(task.department_id?.toString()) || [];
                          const stage = stageList.find((s: any) => s.id === col.milestone.stageId) || { id: col.milestone.stageId };
                          const stageData = task.stages?.[stage.id];
                          const cellValue = stageData?.date || stageData?.completedAt || stageData?.status || null;
                          const linkedDocs = getLinkedDocumentsForTaskStage(task, stage, allDocuments);

                          value = (
                            <EditableStageCell
                              stage={stage}
                              stages={stageList}
                              task={task}
                              value={cellValue}
                              allDocuments={allDocuments}
                              linkedDocuments={linkedDocs}
                              departments={departments}
                              getKycFields={getKycFields}
                              readOnly={true}
                              renderMode="combined"
                              showTime={showTime}
                              previewOnly={true}
                            />
                          );
                        } else if (col.type === 'report_stage_info' && col.reportStageInfo) {
                          value = renderReportStageInfoCell(col, task);
                        } else {
                          value = resolveCellValue(col, task);
                        }
                        const isEmpty = value === null || value === undefined || value === '—';
                        // Class/Sub-Class are optional levels below Sub-Department — a task
                        // sitting at the subdepartment level simply doesn't have one, which
                        // isn't missing data, so it gets a neutral "N/A" instead of the red
                        // "Missing" flag every other empty cell gets.
                        const isNotApplicableColumn = col.id === 'class_name' || col.id === 'subclass_name';

                        return (
                          <TableCell
                            key={col.id}
                            className={cn(
                              "px-4 py-2.5 border-r border-b border-slate-200 text-sm max-w-0 overflow-hidden whitespace-nowrap text-ellipsis transition-colors",
                              isSticky && "sticky z-20 shadow-[2px_0_4px_rgba(0,0,0,0.02)]",
                              col.highlight ? "bg-amber-50/40 group-hover:bg-amber-50/70 text-amber-800 font-medium"
                                : col.type === 'computed_time' ? "bg-violet-50/40 group-hover:bg-violet-50/60"
                                  : "group-hover:bg-blue-50/50",
                              col.primary ? "text-slate-900 font-semibold" : (!col.highlight && col.type !== 'computed_time') && "text-slate-600",
                              col.id === firstHighlightId && "border-l-[3px] border-l-amber-300",
                              // isSticky background comes last so it always wins over the
                              // highlight/computed_time/hover backgrounds above — a sticky
                              // column must stay fully opaque to occlude content scrolling
                              // underneath it, never a translucent overlay tint.
                              isSticky && (idx % 2 === 0 ? "bg-white" : "bg-slate-50"),
                              isSticky && "group-hover:bg-blue-50"
                            )}
                            style={isSticky ? { left: `${left}px` } : undefined}
                          >
                            {isEmpty
                              ? (isNotApplicableColumn
                                ? <span className="text-slate-400">N/A</span>
                                : <span className="text-red-500 font-bold text-xs uppercase tracking-wide">Missing</span>)
                              : value}
                          </TableCell>
                        );
                      })}

                      <TableCell
                        className={cn("sticky right-0 z-20 border-l border-b border-slate-200 py-2.5 shadow-[-2px_0_4px_rgba(0,0,0,0.02)]", idx % 2 === 0 ? "bg-white" : "bg-slate-50", "group-hover:bg-blue-50")}
                      >
                        <RowActionsCell
                          task={task}
                          onEditTask={onEditTask}
                          onRequestCancel={onRequestCancel}
                          onRequestUncancel={onRequestUncancel}
                          onRequestDelete={onRequestDelete}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={interleavedColumns.length + 2} className="h-64 bg-slate-50">
                    <div className="flex flex-col items-center justify-center">
                      <div className="h-12 w-12 rounded-full bg-slate-200 flex items-center justify-center mb-3">
                        <SearchX size={24} className="text-slate-500" />
                      </div>
                      <p className="text-[14px] font-semibold text-slate-700">No tasks found</p>
                      <p className="text-sm mt-1 text-slate-500">Adjust your filters to see more results</p>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        {/* Pagination */}
        <div className="flex items-center justify-between gap-4 border-t border-slate-200 bg-white px-4 py-2.5">
          <div className="flex items-center gap-1.5 text-sm text-slate-500 whitespace-nowrap">
            <span>Showing</span>
            <span className="font-semibold text-slate-700 tabular-nums">{rows.length === 0 ? 0 : ((currentPage - 1) * rowsPerPage) + 1}</span>
            <span>to</span>
            <span className="font-semibold text-slate-700 tabular-nums">{Math.min(currentPage * rowsPerPage, rows.length)}</span>
            <span>of</span>
            <span className="font-semibold text-slate-700 tabular-nums">{rows.length}</span>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-500 whitespace-nowrap">Rows per page</span>
              <Select value={String(rowsPerPage)} onValueChange={(v) => { setRowsPerPage(Number(v)); setCurrentPage(1); }}>
                <SelectTrigger className="h-7 w-[64px] rounded-md border-slate-200 text-[11px] font-medium text-slate-700 shadow-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-md">
                  {[10, 25, 50, 100].map(s => <SelectItem key={s} value={String(s)} className="text-[11px]">{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-1">
              <PaginationButton onClick={() => setCurrentPage(1)} disabled={currentPage === 1} title="First page"><ChevronsLeft size={14} /></PaginationButton>
              <PaginationButton onClick={() => setCurrentPage(p => p - 1)} disabled={currentPage === 1} title="Previous page"><ChevronLeft size={14} /></PaginationButton>

              {pageItems.map((item, idx) =>
                item === 'ellipsis' ? (
                  <span key={`ellipsis-${idx}`} className="px-0.5 text-[11px] text-slate-400 select-none">…</span>
                ) : (
                  <Button
                    key={item}
                    variant={item === currentPage ? 'default' : 'outline'}
                    size="icon"
                    onClick={() => setCurrentPage(item)}
                    className={cn(
                      "h-7 min-w-7 w-auto px-2 rounded-md text-[11px] font-semibold tabular-nums",
                      item === currentPage
                        ? "bg-custom-blue text-white shadow-sm hover:bg-custom-blue"
                        : "text-slate-600 hover:bg-slate-50 hover:border-slate-300"
                    )}
                  >
                    {item}
                  </Button>
                )
              )}

              <PaginationButton onClick={() => setCurrentPage(p => p + 1)} disabled={currentPage === totalPages} title="Next page"><ChevronRight size={14} /></PaginationButton>
              <PaginationButton onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages} title="Last page"><ChevronsRight size={14} /></PaginationButton>
            </div>
          </div>
        </div>
      </div>

      <AlertDialog open={!!pendingRedirectTask} onOpenChange={(open) => { if (!open) setPendingRedirectTask(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <ExternalLink className="h-4 w-4 text-custom-blue" />
              Open Task in New Tab
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingRedirectTask && (
                <>You are about to open <span className="font-semibold text-slate-900">{pendingRedirectTask.job_description || `Task #${pendingRedirectTask.id}`}</span> in the Task Manager. Continue?</>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-custom-blue hover:bg-[#2d5a94] text-white"
              onClick={() => {
                if (pendingRedirectTask) {
                  window.open(buildTaskManagerHref(pendingRedirectTask), '_blank', 'noopener,noreferrer');
                }
                setPendingRedirectTask(null);
              }}
            >
              Open Task
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}