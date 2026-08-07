// @ts-nocheck
"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ExternalLink, ArrowUp, ArrowDown, ArrowUpDown, LayoutGrid, Rows3, Clock, ChevronLeft, ChevronRight, AlertTriangle } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { formatDateCell, formatEstimatedMins } from "../../reports/components/reportCellRenderers";
import { getCanonicalCurrentStage, isStageApplicableToTask, parseDateSafe } from "../../reports/utils/reportStageLogic";
import { MILESTONE_STAGE_COLUMNS } from "../../summary-reports/stageColumnConfig";
import { getCompanyPrefixFromParticipants, getSponsorName } from "../../tasks/overall-view/tableUtils";

const COMPLETED_STATUSES = ['write_up_completed', 'endorsed', 'completed'];

// Same milestone stage ids Summary Reports Dashboard's columns resolve from — deliberately
// NOT task.date_initiated/created_at for "Enquiry Date" (that used to be this column's
// source, and it could show a different date than Summary Reports' Enquiry Date for the
// exact same task, which is exactly the kind of cross-page inconsistency this table is
// meant to avoid).
const ENQUIRY_STAGE_ID = MILESTONE_STAGE_COLUMNS.find(c => c.key === 'registered')?.stageId;
const CONFIRMED_STAGE_ID = MILESTONE_STAGE_COLUMNS.find(c => c.key === 'confirmed')?.stageId;
const REQ_SENT_STAGE_ID = MILESTONE_STAGE_COLUMNS.find(c => c.key === 'quotes_req_sent')?.stageId;
const REQ_RECEIVED_COMPLETED_STAGE_ID = MILESTONE_STAGE_COLUMNS.find(c => c.key === 'req_received_completed')?.stageId;

// Same semantic palette as StatusTabs/PillTrack on the Summary Reports Dashboard, so a task's
// status reads consistently wherever it's shown across the app.
function getStatusBadge(status: string) {
  if (status === 'enquiry') return { label: 'Enquiry', dot: 'bg-slate-400', text: 'text-slate-600', bg: 'bg-slate-100' };
  if (COMPLETED_STATUSES.includes(status)) return { label: 'Completed', dot: 'bg-emerald-500', text: 'text-emerald-700', bg: 'bg-emerald-50' };
  if (status === 'cancel') return { label: 'Cancelled', dot: 'bg-rose-400', text: 'text-rose-600', bg: 'bg-rose-50' };
  return { label: 'WIP', dot: 'bg-amber-500', text: 'text-amber-700', bg: 'bg-amber-50' };
}

const resolveMilestoneDate = (task: any, stageId?: string): string | null => {
  if (!stageId) return null;
  const stageData = task?.stages?.[stageId];
  return stageData?.date || stageData?.completedAt || null;
};

// "Completed" = the most advanced applicable stage that actually has a date, not necessarily
// the literal last stage in the list (which may not be reached yet). Distinct from Actual
// Execution below — this is "when did anything last happen on this task", not measured
// against Promised Time.
function getLastDatedStage(task: any, stages: any[], departments: any[]): string | null {
  const applicable = [...stages].filter(s => isStageApplicableToTask(s, task, departments)).sort((a, b) => (a.order_num || 0) - (b.order_num || 0));
  for (let i = applicable.length - 1; i >= 0; i--) {
    const stageData = task.stages?.[applicable[i].id];
    const raw = stageData?.date || stageData?.completedAt;
    if (raw) return raw;
  }
  return null;
}

// Mirrors SummaryTable.tsx's ActualTimeCell — red text + exceeded badge when a task has run
// past its Promised Time.
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

// Mirrors SummaryTable.tsx's DeltaCell — Actual Execution minus Promised Time.
const DeltaCell = ({ minutes }: { minutes: number }) => {
  if (minutes === 0) return <span className="text-sm font-semibold text-slate-400">On time</span>;
  const isOver = minutes > 0;
  return (
    <span className={cn("text-sm font-bold tabular-nums", isOver ? "text-red-600" : "text-emerald-600")}>
      {isOver ? '+' : '−'}{formatEstimatedMins(Math.abs(minutes))}
    </span>
  );
};

// Mirrors SummaryTable.tsx's PromisedTimeCell — explains *why* this task got this particular
// Promised Time (which Application Type condition matched, or the job-level default), so two
// tasks at the same job level showing different numbers don't read as a data error.
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

// Sticky-column geometry (px). The `left` offsets for # / Task ID / Job Description / Company
// must line up between the header row and every body row for the pinning to hold.
const STICKY_WIDTHS = { index: 48, id: 112, jobDescription: 220, company: 160 };
const STICKY_OFFSETS = {
  index: 0,
  id: STICKY_WIDTHS.index,
  jobDescription: STICKY_WIDTHS.index + STICKY_WIDTHS.id,
  company: STICKY_WIDTHS.index + STICKY_WIDTHS.id + STICKY_WIDTHS.jobDescription,
};

export type TaskListSortConfig = { key: string; direction: 'asc' | 'desc' } | null;

const TRANSFUSED_COLUMNS_PER_PAGE = 8;

const Th = ({ children, sortKey, left, shadowEdge, className, sortConfig, onSort }: {
  children: React.ReactNode;
  sortKey?: string;
  left?: number;
  shadowEdge?: boolean;
  className?: string;
  sortConfig: TaskListSortConfig;
  onSort?: (key: string) => void;
}) => {
  const isActive = sortKey != null && sortConfig?.key === sortKey;
  return (
    <TableHead
      onClick={sortKey != null ? () => onSort?.(sortKey) : undefined}
      className={cn(
        "px-4 py-2.5 border-r border-b border-white/30 bg-custom-blue whitespace-nowrap sticky top-0 z-40 transition-colors",
        left != null && "z-50",
        shadowEdge && "shadow-[2px_0_4px_rgba(0,0,0,0.15)]",
        sortKey != null && "cursor-pointer select-none hover:bg-slate-700",
        isActive && "bg-slate-800",
        className
      )}
      style={left != null ? { left } : undefined}
    >
      <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-white">
        {children}
        {sortKey != null && (
          isActive
            ? sortConfig.direction === 'asc'
              ? <ArrowUp className="h-3 w-3 shrink-0" />
              : <ArrowDown className="h-3 w-3 shrink-0" />
            : <ArrowUpDown className="h-3 w-3 shrink-0 text-white/40" />
        )}
      </span>
    </TableHead>
  );
};

const Td = ({ children, idx, primary, left, shadowEdge, className }: {
  children?: React.ReactNode;
  idx: number;
  primary?: boolean;
  left?: number;
  shadowEdge?: boolean;
  className?: string;
}) => (
  <TableCell className={cn(
    "px-4 py-2.5 border-r border-b border-slate-200 text-sm whitespace-nowrap",
    primary ? "font-semibold text-slate-900" : "text-slate-600",
    idx % 2 === 0 ? "bg-white" : "bg-slate-100/50",
    "group-hover:bg-blue-50/50",
    left != null && "sticky z-30",
    shadowEdge && "shadow-[2px_0_4px_rgba(0,0,0,0.03)]",
    className
  )} style={left != null ? { left } : undefined}>
    {children ?? <span className="text-slate-300 font-normal">—</span>}
  </TableCell>
);

// Task list card reused for both a company's direct (company-level applicant) tasks and an
// individual's full job history — same table chrome as SummaryTable.tsx (sticky
// bg-custom-blue header, zebra rows, rounded-xl card), and as of this column set, the exact
// same columns/values as the Summary Reports Dashboard table (Applicant/Company Prefix/
// Sponsor/Promised Time/Planned & Actual Execution/Δ vs Promised/Stages Time Expected —
// resolved via the same shared getters in company-profiles/page.tsx, which delegate to
// summary-reports/utils/executionMath.ts) — so a task can't show conflicting information
// depending on which page you're looking at it from.
export function TaskListTable({
  tasks, departments, stagesByDept, companies,
  enhancedTasksData, getExpectedMinutesForTask,
  getPromisedTimeResolutionForTask, getPlannedExecutionDateForTask, getActualTimeInfoForTask,
  showCompanyColumn = false,
  emptyLabel = "No tasks found",
}: {
  tasks: any[];
  departments: any[];
  stagesByDept: Map<string, any[]>;
  companies: Map<number, { name: string; prefix: string }>;
  enhancedTasksData?: Map<string, any>;
  getExpectedMinutesForTask?: (task: any) => number;
  getPromisedTimeResolutionForTask?: (task: any) => { minutes: number | null; source: 'condition' | 'default' | 'none'; applicationType: string | null; matchedValue?: string };
  getPlannedExecutionDateForTask?: (task: any) => Date | null;
  getActualTimeInfoForTask?: (task: any) => { diffDays: number; isOverdue: boolean; exceededMinutes: number; deltaMinutes: number | null } | null;
  showCompanyColumn?: boolean;
  emptyLabel?: string;
}) {
  const [sortConfig, setSortConfig] = useState<TaskListSortConfig>(null);

  // "Show time / hide time" in the date cells, and the Rows / Transposed view switch.
  const [showTime, setShowTime] = useState(true);
  const [isTransposed, setIsTransposed] = useState(false);
  const [transposedPage, setTransposedPage] = useState(1);

  const handleSort = useCallback((key: string) => {
    setSortConfig(cur => cur?.key === key ? { key, direction: cur.direction === 'asc' ? 'desc' : 'asc' } : { key, direction: 'asc' });
  }, []);

  const getSortableValue = useCallback((task: any, key: string): any => {
    const taskStages = stagesByDept.get(task.department_id?.toString()) || [];
    const department = departments.find((d: any) => d.id.toString() === task.department_id?.toString());
    const subdepartment = department?.tm_subdepartments?.find((s: any) => s.id.toString() === task.subdepartment_id?.toString());
    const classItem = subdepartment?.classes?.find((c: any) => c.id.toString() === task.class_id?.toString());
    const subClassItem = classItem?.subClasses?.find((sc: any) => sc.id.toString() === task.subclass_id?.toString());
    const enhancedTask = enhancedTasksData?.get(task.id?.toString()) || task;
    switch (key) {
      case 'id': return task.id ?? 0;
      case 'job_description': return (task.job_description || '').toLowerCase();
      case 'company': return (companies.get(task.company_id)?.name || task.company_name || '').toLowerCase();
      case 'applicant': return (task.applicant_name || '').toLowerCase();
      case 'company_prefix': return getCompanyPrefixFromParticipants(task, companies).toLowerCase();
      case 'sponsor_name': return (getSponsorName(task) || '').toLowerCase();
      case 'department': return (department?.name || '').toLowerCase();
      case 'subdepartment': return (subdepartment?.name || '').toLowerCase();
      case 'class': return (classItem?.name || '').toLowerCase();
      case 'subclass': return (subClassItem?.name || '').toLowerCase();
      case 'status': return task.status || '';
      case 'current_stage': return (getCanonicalCurrentStage(task, taskStages, departments)?.name || '').toLowerCase();
      case 'duration': return (enhancedTask.duration || task.duration || '').toLowerCase();
      case 'application_type': return (enhancedTask.renewal_status || task.renewal_status || '').toLowerCase();
      case 'registered': return parseDateSafe(resolveMilestoneDate(task, ENQUIRY_STAGE_ID))?.getTime() || 0;
      case 'confirmed': return parseDateSafe(resolveMilestoneDate(task, CONFIRMED_STAGE_ID))?.getTime() || 0;
      case 'req_sent': return parseDateSafe(resolveMilestoneDate(task, REQ_SENT_STAGE_ID))?.getTime() || 0;
      case 'req_received_completed': return parseDateSafe(resolveMilestoneDate(task, REQ_RECEIVED_COMPLETED_STAGE_ID))?.getTime() || 0;
      case 'promised_time': return getPromisedTimeResolutionForTask?.(task)?.minutes ?? 0;
      case 'planned_execution': return getPlannedExecutionDateForTask?.(task)?.getTime() ?? 0;
      case 'actual_execution': return getActualTimeInfoForTask?.(task)?.actualMinutes ?? 0;
      case 'execution_delta': return getActualTimeInfoForTask?.(task)?.deltaMinutes ?? 0;
      case 'stages_time_expected': return getExpectedMinutesForTask?.(task) ?? 0;
      case 'completed': {
        if (!COMPLETED_STATUSES.includes(task.status)) return 0;
        return parseDateSafe(getLastDatedStage(task, taskStages, departments))?.getTime() || 0;
      }
      default: return '';
    }
  }, [departments, stagesByDept, companies, enhancedTasksData, getPromisedTimeResolutionForTask, getPlannedExecutionDateForTask, getActualTimeInfoForTask, getExpectedMinutesForTask]);

  const sortedTasks = useMemo(() => {
    if (!sortConfig) return tasks;
    const { key, direction } = sortConfig;
    return [...tasks].sort((a, b) => {
      const av = getSortableValue(a, key);
      const bv = getSortableValue(b, key);
      if (av < bv) return direction === 'asc' ? -1 : 1;
      if (av > bv) return direction === 'asc' ? 1 : -1;
      return (a.id ?? 0) - (b.id ?? 0);
    });
  }, [tasks, sortConfig, getSortableValue]);

  // Transposed view paginates task columns so a wide job history stays usable.
  const transposedTotalPages = Math.max(1, Math.ceil(sortedTasks.length / TRANSFUSED_COLUMNS_PER_PAGE));
  const transposedPageSafe = Math.min(transposedPage, transposedTotalPages);
  const transposedTasks = useMemo(
    () => sortedTasks.slice((transposedPageSafe - 1) * TRANSFUSED_COLUMNS_PER_PAGE, transposedPageSafe * TRANSFUSED_COLUMNS_PER_PAGE),
    [sortedTasks, transposedPageSafe]
  );

  useEffect(() => { setTransposedPage(1); }, [isTransposed]);

  // Pre-resolved per-task view for the transposed (columns = tasks, rows = fields) layout,
  // mirroring the per-row derivation the standard table does inline so both stay in lockstep.
  const taskViews = useMemo(() => {
    const map = new Map<string | number, any>();
    sortedTasks.forEach((task) => {
      const taskStages = stagesByDept.get(task.department_id?.toString()) || [];
      const department = departments.find((d: any) => d.id.toString() === task.department_id?.toString());
      const subdepartment = department?.tm_subdepartments?.find((s: any) => s.id.toString() === task.subdepartment_id?.toString());
      const classItem = subdepartment?.classes?.find((c: any) => c.id.toString() === task.class_id?.toString());
      const subClassItem = classItem?.subClasses?.find((sc: any) => sc.id.toString() === task.subclass_id?.toString());
      const enhancedTask = enhancedTasksData?.get(task.id?.toString()) || task;
      map.set(task.id, {
        id: task.id,
        jobDescription: task.job_description || null,
        companyName: companies.get(task.company_id)?.name || task.company_name || null,
        applicantName: task.applicant_name || null,
        companyPrefix: getCompanyPrefixFromParticipants(task, companies),
        sponsorName: getSponsorName(task),
        department: department?.name || null,
        subdepartment: subdepartment?.name || null,
        class: classItem?.name || null,
        subclass: subClassItem?.name || null,
        status: task.status,
        statusBadge: getStatusBadge(task.status),
        currentStage: getCanonicalCurrentStage(task, taskStages, departments)?.name || null,
        duration: enhancedTask.duration || task.duration || null,
        applicationType: enhancedTask.renewal_status || task.renewal_status || null,
        registered: resolveMilestoneDate(task, ENQUIRY_STAGE_ID),
        confirmed: resolveMilestoneDate(task, CONFIRMED_STAGE_ID),
        reqSent: resolveMilestoneDate(task, REQ_SENT_STAGE_ID),
        reqReceivedCompleted: resolveMilestoneDate(task, REQ_RECEIVED_COMPLETED_STAGE_ID),
        promisedTimeResolution: getPromisedTimeResolutionForTask?.(task) ?? null,
        plannedExecution: getPlannedExecutionDateForTask?.(task) ?? null,
        actualExecutionInfo: getActualTimeInfoForTask?.(task) ?? null,
        stagesTimeExpected: getExpectedMinutesForTask?.(task) ?? 0,
        completed: COMPLETED_STATUSES.includes(task.status) ? getLastDatedStage(task, taskStages, departments) : null,
      });
    });
    return map;
  }, [sortedTasks, departments, stagesByDept, companies, enhancedTasksData, getPromisedTimeResolutionForTask, getPlannedExecutionDateForTask, getActualTimeInfoForTask, getExpectedMinutesForTask]);

  const transposedFields = useMemo(() => {
    const fields = [
      { key: 'job_description', label: 'Job Description' },
      ...(showCompanyColumn ? [{ key: 'company', label: 'Company' }] : []),
      { key: 'applicant', label: 'Applicant Name' },
      { key: 'company_prefix', label: 'Company Prefix' },
      { key: 'sponsor_name', label: 'Sponsor Name' },
      { key: 'department', label: 'Department' },
      { key: 'subdepartment', label: 'Sub-Department' },
      { key: 'class', label: 'Class' },
      { key: 'subclass', label: 'Sub Class' },
      { key: 'status', label: 'Status' },
      { key: 'current_stage', label: 'Current Stage Name' },
      { key: 'duration', label: 'Duration' },
      { key: 'application_type', label: 'Application Type' },
      { key: 'registered', label: 'Enquiry Date' },
      { key: 'confirmed', label: 'Confirmed Date' },
      { key: 'req_sent', label: 'Bill(Quote) Raised & Req. Checklist Sent' },
      { key: 'req_received_completed', label: 'Req. Received & Completed Date' },
      { key: 'promised_time', label: 'Promised Time' },
      { key: 'planned_execution', label: 'Planned Execution' },
      { key: 'actual_execution', label: 'Actual Execution' },
      { key: 'execution_delta', label: 'Δ vs Promised' },
      { key: 'stages_time_expected', label: 'Stages Time Expected' },
      { key: 'completed', label: 'Last Activity Date' },
      { key: 'open', label: 'Open' },
    ];
    return fields;
  }, [showCompanyColumn]);

  const renderTransposedCell = useCallback((view: any, key: string) => {
    switch (key) {
      case 'job_description':
        return view.jobDescription ? <span className="text-slate-900 font-semibold whitespace-normal">{view.jobDescription}</span> : null;
      case 'company': return view.companyName || null;
      case 'applicant': return view.applicantName || null;
      case 'company_prefix': return view.companyPrefix && view.companyPrefix !== 'N/A' ? view.companyPrefix : null;
      case 'sponsor_name': return view.sponsorName || null;
      case 'department': return view.department || null;
      case 'subdepartment': return view.subdepartment || null;
      case 'class': return view.class || null;
      case 'subclass': return view.subclass || null;
      case 'status': {
        const b = view.statusBadge;
        return (
          <span className={cn("inline-flex items-center gap-1.5 text-xs font-bold px-2 py-1 rounded-full", b.bg, b.text)}>
            <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", b.dot)} />
            {b.label}
          </span>
        );
      }
      case 'current_stage': return view.currentStage || null;
      case 'duration': return view.duration || null;
      case 'application_type': return view.applicationType || null;
      case 'registered': return formatDateCell(view.registered, showTime);
      case 'confirmed': return formatDateCell(view.confirmed, showTime);
      case 'req_sent': return formatDateCell(view.reqSent, showTime);
      case 'req_received_completed': return formatDateCell(view.reqReceivedCompleted, showTime);
      case 'promised_time': {
        const r = view.promisedTimeResolution;
        if (!r?.minutes) return null;
        return <PromisedTimeCell display={formatEstimatedMins(r.minutes)} resolution={r} />;
      }
      case 'planned_execution': return view.plannedExecution ? formatDateCell(view.plannedExecution.toISOString(), showTime) : null;
      case 'actual_execution': {
        const info = view.actualExecutionInfo;
        if (!info) return null;
        const display = `${info.diffDays}d`;
        return info.isOverdue ? <ActualTimeCell display={display} exceededMinutes={info.exceededMinutes} /> : display;
      }
      case 'execution_delta': {
        const info = view.actualExecutionInfo;
        if (!info || info.deltaMinutes == null) return null;
        return <DeltaCell minutes={info.deltaMinutes} />;
      }
      case 'stages_time_expected': return view.stagesTimeExpected > 0 ? formatEstimatedMins(view.stagesTimeExpected) : null;
      case 'completed': return view.completed ? formatDateCell(view.completed, showTime) : null;
      case 'open':
        return (
          <Link
            href={`/dashboard/tasks/${view.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center h-7 w-7 rounded-lg text-slate-400 hover:text-custom-blue hover:bg-blue-50 transition-colors"
            title="Open in Job Workspace"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        );
      default: return null;
    }
  }, [showTime]);

  if (!tasks.length) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center bg-white rounded-xl border border-slate-200">
        <p className="text-sm font-semibold text-slate-500">{emptyLabel}</p>
      </div>
    );
  }

  // The last sticky column (Job Description, or Company when shown) gets the edge shadow so
  // scrolling past it reads as a "page edge", not a seam between two pinned columns.

  return (
    <>
      <div className="flex items-center justify-end gap-2 mb-2">
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-full border border-slate-200">
          <button
            onClick={() => setIsTransposed(false)}
            className={cn(
              "px-3 h-7 text-xs font-bold rounded-full transition-all flex items-center gap-1.5",
              !isTransposed ? "bg-white text-custom-blue shadow-sm" : "text-slate-500 hover:text-slate-900"
            )}
          >
            <Rows3 className="h-3 w-3" /> Rows
          </button>
          <button
            onClick={() => setIsTransposed(true)}
            className={cn(
              "px-3 h-7 text-xs font-bold rounded-full transition-all flex items-center gap-1.5",
              isTransposed ? "bg-white text-custom-blue shadow-sm" : "text-slate-500 hover:text-slate-900"
            )}
          >
            <LayoutGrid className="h-3 w-3" /> Transposed
          </button>
        </div>
        <div className="h-5 w-px bg-slate-200" />
        <button
          onClick={() => setShowTime(s => !s)}
          title={showTime ? "Hide time in date cells" : "Show time in date cells"}
          className={cn(
            "h-7 px-3 text-xs font-bold rounded-full border transition-all flex items-center gap-1.5",
            showTime ? "bg-white text-custom-blue shadow-sm border-slate-200" : "bg-slate-50 text-slate-400 hover:text-slate-700 border-transparent"
          )}
        >
          <Clock className="h-3 w-3" />
          {showTime ? 'Time shown' : 'Date only'}
        </button>
      </div>

      {isTransposed ? (
        <div className="rounded-xl border border-slate-200 shadow-sm overflow-auto max-h-[calc(100vh-340px)] custom-scrollbar">
          <Table className="border-separate border-spacing-0">
            <TableHeader className="sticky top-0 z-40">
              <TableRow className="hover:bg-transparent border-0">
                <Th sortConfig={sortConfig} left={0} className="w-14 min-w-[56px] max-w-[56px] text-center">#</Th>
                <Th sortConfig={sortConfig} left={56} className="w-48 min-w-[192px] max-w-[192px]">Field</Th>
                {transposedTasks.map(task => (
                  <Th key={task.id} sortConfig={sortConfig} className="w-52 min-w-[208px] max-w-[208px]">
                    <span className="truncate">#{task.id}</span>
                    <Link
                      href={`/dashboard/tasks/${task.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-white/70 hover:text-white transition-colors"
                      title="Open in Job Workspace"
                    >
                      <ExternalLink className="h-3 w-3 shrink-0" />
                    </Link>
                  </Th>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {transposedFields.map((field, fi) => (
                <TableRow key={field.key} className={cn("group border-0 transition-colors", fi % 2 === 0 ? "bg-white" : "bg-slate-100/50", "hover:bg-blue-50/50")}>
                  <Td idx={fi} left={0} className="w-14 min-w-[56px] max-w-[56px] text-center">{fi + 1}</Td>
                  <Td idx={fi} left={56} className="w-48 min-w-[192px] max-w-[192px] font-semibold text-slate-600">{field.label}</Td>
                  {transposedTasks.map(task => (
                    <Td idx={fi} key={task.id} className="w-52 min-w-[208px] max-w-[208px] whitespace-normal align-top">
                      {renderTransposedCell(taskViews.get(task.id), field.key) ?? <span className="text-slate-300 font-normal">—</span>}
                    </Td>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {sortedTasks.length > TRANSFUSED_COLUMNS_PER_PAGE && (
            <div className="sticky bottom-0 z-40 flex items-center justify-between px-4 py-2.5 border-t border-slate-200 bg-slate-50/95">
              <span className="text-xs font-bold text-slate-500">
                Showing {transposedTasks.length} of {sortedTasks.length} tasks
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setTransposedPage(Math.max(1, transposedPageSafe - 1))}
                  disabled={transposedPageSafe <= 1}
                  className="h-7 w-7 rounded-lg bg-white border border-slate-200 text-slate-500 hover:text-slate-900 disabled:opacity-40 flex items-center justify-center"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                <span className="px-3 text-xs font-bold text-slate-700">{transposedPageSafe} / {transposedTotalPages}</span>
                <button
                  onClick={() => setTransposedPage(Math.min(transposedTotalPages, transposedPageSafe + 1))}
                  disabled={transposedPageSafe >= transposedTotalPages}
                  className="h-7 w-7 rounded-lg bg-white border border-slate-200 text-slate-500 hover:text-slate-900 disabled:opacity-40 flex items-center justify-center"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 shadow-sm overflow-auto max-h-[calc(100vh-340px)] custom-scrollbar">
      <Table className="border-separate border-spacing-0 min-w-full">
        <TableHeader className="sticky top-0 z-40">
          <TableRow className="hover:bg-transparent border-0">
            <Th sortConfig={sortConfig} onSort={handleSort} left={STICKY_OFFSETS.index} className="w-12 min-w-12 max-w-12 text-center">#</Th>
            <Th sortConfig={sortConfig} onSort={handleSort} sortKey="id" left={STICKY_OFFSETS.id} className="w-28 min-w-[112px] max-w-[112px]">Task ID</Th>
            <Th
              sortConfig={sortConfig}
              onSort={handleSort}
              sortKey="job_description"
              left={STICKY_OFFSETS.jobDescription}
              shadowEdge={!showCompanyColumn}
              className="w-[220px] min-w-[220px] max-w-[220px]"
            >
              Job Description
            </Th>
            {showCompanyColumn && (
              <Th sortConfig={sortConfig} onSort={handleSort} sortKey="company" left={STICKY_OFFSETS.company} shadowEdge className="w-40 min-w-[160px] max-w-[160px]">
                Company
              </Th>
            )}
            <Th sortConfig={sortConfig} onSort={handleSort} sortKey="applicant">Applicant Name</Th>
            <Th sortConfig={sortConfig} onSort={handleSort} sortKey="company_prefix">Company Prefix</Th>
            <Th sortConfig={sortConfig} onSort={handleSort} sortKey="sponsor_name">Sponsor Name</Th>
            <Th sortConfig={sortConfig} onSort={handleSort} sortKey="department">Department</Th>
            <Th sortConfig={sortConfig} onSort={handleSort} sortKey="subdepartment">Sub-Department</Th>
            <Th sortConfig={sortConfig} onSort={handleSort} sortKey="class">Class</Th>
            <Th sortConfig={sortConfig} onSort={handleSort} sortKey="subclass">Sub Class</Th>
            <Th sortConfig={sortConfig} onSort={handleSort} sortKey="status">Status</Th>
            <Th sortConfig={sortConfig} onSort={handleSort} sortKey="current_stage">Current Stage</Th>
            <Th sortConfig={sortConfig} onSort={handleSort} sortKey="duration">Duration</Th>
            <Th sortConfig={sortConfig} onSort={handleSort} sortKey="application_type">Application Type</Th>
            <Th sortConfig={sortConfig} onSort={handleSort} sortKey="registered">Enquiry Date</Th>
            <Th sortConfig={sortConfig} onSort={handleSort} sortKey="confirmed">Confirmed</Th>
            <Th sortConfig={sortConfig} onSort={handleSort} sortKey="req_sent">Req Sent</Th>
            <Th sortConfig={sortConfig} onSort={handleSort} sortKey="req_received_completed">Req. Received & Completed</Th>
            <Th sortConfig={sortConfig} onSort={handleSort} sortKey="promised_time">Promised Time</Th>
            <Th sortConfig={sortConfig} onSort={handleSort} sortKey="planned_execution">Planned Execution</Th>
            <Th sortConfig={sortConfig} onSort={handleSort} sortKey="actual_execution">Actual Execution</Th>
            <Th sortConfig={sortConfig} onSort={handleSort} sortKey="execution_delta">Δ vs Promised</Th>
            <Th sortConfig={sortConfig} onSort={handleSort} sortKey="stages_time_expected">Stages Time Expected</Th>
            <Th sortConfig={sortConfig} onSort={handleSort} sortKey="completed">Last Activity</Th>
            <Th sortConfig={sortConfig} onSort={handleSort}>Open</Th>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedTasks.map((task, idx) => {
            const badge = getStatusBadge(task.status);
            const taskStages = stagesByDept.get(task.department_id?.toString()) || [];
            const currentStageName = getCanonicalCurrentStage(task, taskStages, departments)?.name || null;
            const company = companies.get(task.company_id);

            const department = departments.find((d: any) => d.id.toString() === task.department_id?.toString());
            const subdepartment = department?.tm_subdepartments?.find((s: any) => s.id.toString() === task.subdepartment_id?.toString());
            const classItem = subdepartment?.classes?.find((c: any) => c.id.toString() === task.class_id?.toString());
            const subClassItem = classItem?.subClasses?.find((sc: any) => sc.id.toString() === task.subclass_id?.toString());

            const enhancedTask = enhancedTasksData?.get(task.id?.toString()) || task;
            const duration = enhancedTask.duration || task.duration || null;
            const applicationType = enhancedTask.renewal_status || task.renewal_status || null;
            const companyPrefix = getCompanyPrefixFromParticipants(task, companies);
            const sponsorName = getSponsorName(task);

            const registeredRaw = resolveMilestoneDate(task, ENQUIRY_STAGE_ID);
            const confirmedRaw = resolveMilestoneDate(task, CONFIRMED_STAGE_ID);
            const reqSentRaw = resolveMilestoneDate(task, REQ_SENT_STAGE_ID);
            const reqReceivedCompletedRaw = resolveMilestoneDate(task, REQ_RECEIVED_COMPLETED_STAGE_ID);
            const isCompleted = COMPLETED_STATUSES.includes(task.status);
            const completedRaw = isCompleted ? getLastDatedStage(task, taskStages, departments) : null;

            const promisedTimeResolution = getPromisedTimeResolutionForTask?.(task) ?? null;
            const plannedExecution = getPlannedExecutionDateForTask?.(task) ?? null;
            const actualExecutionInfo = getActualTimeInfoForTask?.(task) ?? null;
            const stagesTimeExpected = getExpectedMinutesForTask?.(task) ?? 0;

            return (
              <TableRow key={task.id} className={cn("group border-0 transition-colors", idx % 2 === 0 ? "bg-white" : "bg-slate-100/50", "hover:bg-blue-50/50")}>
                <Td idx={idx} left={STICKY_OFFSETS.index} className="w-12 min-w-12 max-w-12 text-center">{idx + 1}</Td>
                <Td idx={idx} primary left={STICKY_OFFSETS.id} className="w-28 min-w-[112px] max-w-[112px]">{task.id}</Td>
                <Td
                  idx={idx}
                  primary
                  left={STICKY_OFFSETS.jobDescription}
                  shadowEdge={!showCompanyColumn}
                  className="whitespace-normal min-w-[220px] max-w-[220px]"
                >
                  {task.job_description}
                </Td>
                {showCompanyColumn && (
                  <Td idx={idx} left={STICKY_OFFSETS.company} shadowEdge className="min-w-[160px] max-w-[160px]">
                    {company?.name || task.company_name}
                  </Td>
                )}
                <Td idx={idx}>{task.applicant_name}</Td>
                <Td idx={idx}>{companyPrefix && companyPrefix !== 'N/A' ? companyPrefix : null}</Td>
                <Td idx={idx}>{sponsorName}</Td>
                <Td idx={idx}>{department?.name}</Td>
                <Td idx={idx}>{subdepartment?.name}</Td>
                <Td idx={idx}>{classItem?.name}</Td>
                <Td idx={idx}>{subClassItem?.name}</Td>
                <Td idx={idx}>
                  <span className={cn("inline-flex items-center gap-1.5 text-xs font-bold px-2 py-1 rounded-full", badge.bg, badge.text)}>
                    <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", badge.dot)} />
                    {badge.label}
                  </span>
                </Td>
                <Td idx={idx}>{currentStageName}</Td>
                <Td idx={idx}>{duration}</Td>
                <Td idx={idx}>{applicationType}</Td>
                <Td idx={idx}>{formatDateCell(registeredRaw, showTime)}</Td>
                <Td idx={idx}>{formatDateCell(confirmedRaw, showTime)}</Td>
                <Td idx={idx}>{formatDateCell(reqSentRaw, showTime)}</Td>
                <Td idx={idx}>{formatDateCell(reqReceivedCompletedRaw, showTime)}</Td>
                <Td idx={idx}>
                  {promisedTimeResolution?.minutes
                    ? <PromisedTimeCell display={formatEstimatedMins(promisedTimeResolution.minutes)} resolution={promisedTimeResolution} />
                    : null}
                </Td>
                <Td idx={idx}>{plannedExecution ? formatDateCell(plannedExecution.toISOString(), showTime) : null}</Td>
                <Td idx={idx}>
                  {actualExecutionInfo
                    ? (actualExecutionInfo.isOverdue
                      ? <ActualTimeCell display={`${actualExecutionInfo.diffDays}d`} exceededMinutes={actualExecutionInfo.exceededMinutes} />
                      : `${actualExecutionInfo.diffDays}d`)
                    : null}
                </Td>
                <Td idx={idx}>
                  {actualExecutionInfo?.deltaMinutes != null ? <DeltaCell minutes={actualExecutionInfo.deltaMinutes} /> : null}
                </Td>
                <Td idx={idx}>{stagesTimeExpected > 0 ? formatEstimatedMins(stagesTimeExpected) : null}</Td>
                <Td idx={idx}>{completedRaw ? formatDateCell(completedRaw, showTime) : null}</Td>
                <TableCell className={cn("px-4 py-2.5 border-b border-slate-200 text-center", idx % 2 === 0 ? "bg-white" : "bg-slate-100/50", "group-hover:bg-blue-50/50")}>
                  <Link
                    href={`/dashboard/tasks/${task.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center h-7 w-7 rounded-lg text-slate-400 hover:text-custom-blue hover:bg-blue-50 transition-colors"
                    title="Open in Job Workspace"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </Link>
                </TableCell>
              </TableRow>
            );
          })}
          </TableBody>
        </Table>
      </div>
      )}
    </>
  );
}
