// @ts-nocheck
"use client";

import React, { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { ExternalLink, ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { formatDateCell } from "../../reports/components/reportCellRenderers";
import { getCanonicalCurrentStage, isStageApplicableToTask, parseDateSafe } from "../../reports/utils/reportStageLogic";
import { MILESTONE_STAGE_COLUMNS } from "../../summary-reports/stageColumnConfig";

const COMPLETED_STATUSES = ['write_up_completed', 'endorsed', 'completed'];

const REQ_SENT_STAGE_ID = MILESTONE_STAGE_COLUMNS.find(c => c.key === 'quotes_req_sent')?.stageId;
const CONFIRMED_STAGE_ID = MILESTONE_STAGE_COLUMNS.find(c => c.key === 'confirmed')?.stageId;

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
// the literal last stage in the list (which may not be reached yet).
function getLastDatedStage(task: any, stages: any[], departments: any[]): string | null {
  const applicable = [...stages].filter(s => isStageApplicableToTask(s, task, departments)).sort((a, b) => (a.order_num || 0) - (b.order_num || 0));
  for (let i = applicable.length - 1; i >= 0; i--) {
    const stageData = task.stages?.[applicable[i].id];
    const raw = stageData?.date || stageData?.completedAt;
    if (raw) return raw;
  }
  return null;
}

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
// bg-custom-blue header, zebra rows, rounded-xl card) so it reads as part of the same system.
export function TaskListTable({
  tasks, departments, stagesByDept, companies,
  enhancedTasksData, getExpectedMinutesForTask,
  showCompanyColumn = false,
  emptyLabel = "No tasks found",
}: {
  tasks: any[];
  departments: any[];
  stagesByDept: Map<string, any[]>;
  companies: Map<number, { name: string; prefix: string }>;
  enhancedTasksData?: Map<string, any>;
  getExpectedMinutesForTask?: (task: any) => number;
  showCompanyColumn?: boolean;
  emptyLabel?: string;
}) {
  const [sortConfig, setSortConfig] = useState<TaskListSortConfig>(null);

  const handleSort = useCallback((key: string) => {
    setSortConfig(cur => cur?.key === key ? { key, direction: cur.direction === 'asc' ? 'desc' : 'asc' } : { key, direction: 'asc' });
  }, []);

  // Shared between the "On Time?" cell and the sort value so both stay in lockstep.
  const getOnTimeStatus = useCallback((task: any): 'on_time' | 'late' | null => {
    const taskStages = stagesByDept.get(task.department_id?.toString()) || [];
    if (!COMPLETED_STATUSES.includes(task.status)) return null;
    const registered = task.date_initiated || task.created_at || null;
    const completedRaw = getLastDatedStage(task, taskStages, departments);
    if (!completedRaw || !registered || !getExpectedMinutesForTask) return null;
    const start = parseDateSafe(registered);
    const end = parseDateSafe(completedRaw);
    const expectedMinutes = getExpectedMinutesForTask(task);
    if (!start || !end || expectedMinutes <= 0) return null;
    const elapsedMinutes = Math.max(0, Math.floor((end.getTime() - start.getTime()) / 60000));
    return elapsedMinutes <= expectedMinutes ? 'on_time' : 'late';
  }, [stagesByDept, departments, getExpectedMinutesForTask]);

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
      case 'department': return (department?.name || '').toLowerCase();
      case 'subdepartment': return (subdepartment?.name || '').toLowerCase();
      case 'class': return (classItem?.name || '').toLowerCase();
      case 'subclass': return (subClassItem?.name || '').toLowerCase();
      case 'status': return task.status || '';
      case 'current_stage': return (getCanonicalCurrentStage(task, taskStages, departments)?.name || '').toLowerCase();
      case 'duration': return (enhancedTask.duration || task.duration || '').toLowerCase();
      case 'application_type': return (enhancedTask.renewal_status || task.renewal_status || '').toLowerCase();
      case 'registered': return parseDateSafe(task.date_initiated || task.created_at)?.getTime() || 0;
      case 'req_sent': return parseDateSafe(resolveMilestoneDate(task, REQ_SENT_STAGE_ID))?.getTime() || 0;
      case 'confirmed': return parseDateSafe(resolveMilestoneDate(task, CONFIRMED_STAGE_ID))?.getTime() || 0;
      case 'completed': {
        if (!COMPLETED_STATUSES.includes(task.status)) return 0;
        return parseDateSafe(getLastDatedStage(task, taskStages, departments))?.getTime() || 0;
      }
      case 'on_time': {
        const v = getOnTimeStatus(task);
        return v === 'late' ? 1 : v === 'on_time' ? 2 : 0;
      }
      default: return '';
    }
  }, [departments, stagesByDept, companies, enhancedTasksData, getOnTimeStatus]);

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
            <Th sortConfig={sortConfig} onSort={handleSort} sortKey="department">Department</Th>
            <Th sortConfig={sortConfig} onSort={handleSort} sortKey="subdepartment">Sub-Department</Th>
            <Th sortConfig={sortConfig} onSort={handleSort} sortKey="class">Class</Th>
            <Th sortConfig={sortConfig} onSort={handleSort} sortKey="subclass">Sub Class</Th>
            <Th sortConfig={sortConfig} onSort={handleSort} sortKey="status">Status</Th>
            <Th sortConfig={sortConfig} onSort={handleSort} sortKey="current_stage">Current Stage</Th>
            <Th sortConfig={sortConfig} onSort={handleSort} sortKey="duration">Duration</Th>
            <Th sortConfig={sortConfig} onSort={handleSort} sortKey="application_type">Application Type</Th>
            <Th sortConfig={sortConfig} onSort={handleSort} sortKey="registered">Registered</Th>
            <Th sortConfig={sortConfig} onSort={handleSort} sortKey="req_sent">Req Sent</Th>
            <Th sortConfig={sortConfig} onSort={handleSort} sortKey="confirmed">Confirmed</Th>
            <Th sortConfig={sortConfig} onSort={handleSort} sortKey="completed">Completed</Th>
            <Th sortConfig={sortConfig} onSort={handleSort} sortKey="on_time">On Time?</Th>
            <Th sortConfig={sortConfig} onSort={handleSort}>Open</Th>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedTasks.map((task, idx) => {
            const badge = getStatusBadge(task.status);
            const taskStages = stagesByDept.get(task.department_id?.toString()) || [];
            const currentStageName = getCanonicalCurrentStage(task, taskStages, departments)?.name || null;
            const company = companies.get(task.company_id);
            const registered = task.date_initiated || task.created_at || null;

            const department = departments.find((d: any) => d.id.toString() === task.department_id?.toString());
            const subdepartment = department?.tm_subdepartments?.find((s: any) => s.id.toString() === task.subdepartment_id?.toString());
            const classItem = subdepartment?.classes?.find((c: any) => c.id.toString() === task.class_id?.toString());
            const subClassItem = classItem?.subClasses?.find((sc: any) => sc.id.toString() === task.subclass_id?.toString());

            const enhancedTask = enhancedTasksData?.get(task.id?.toString()) || task;
            const duration = enhancedTask.duration || task.duration || null;
            const applicationType = enhancedTask.renewal_status || task.renewal_status || null;

            const reqSentRaw = resolveMilestoneDate(task, REQ_SENT_STAGE_ID);
            const confirmedRaw = resolveMilestoneDate(task, CONFIRMED_STAGE_ID);
            const isCompleted = COMPLETED_STATUSES.includes(task.status);
            const completedRaw = isCompleted ? getLastDatedStage(task, taskStages, departments) : null;

            const onTime = getOnTimeStatus(task);

            return (
              <TableRow key={task.id} className={cn("group border-0 transition-colors", idx % 2 === 0 ? "bg-white" : "bg-slate-100/50", "hover:bg-blue-50/50")}>
                <Td idx={idx} left={STICKY_OFFSETS.index} className="text-center">{idx + 1}</Td>
                <Td idx={idx} primary left={STICKY_OFFSETS.id}>{task.id}</Td>
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
                <Td idx={idx}>{formatDateCell(registered, true)}</Td>
                <Td idx={idx}>{formatDateCell(reqSentRaw, true)}</Td>
                <Td idx={idx}>{formatDateCell(confirmedRaw, true)}</Td>
                <Td idx={idx}>{completedRaw ? formatDateCell(completedRaw, true) : null}</Td>
                <Td idx={idx}>
                  {onTime === 'on_time' ? (
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold px-2 py-1 rounded-full bg-emerald-50 text-emerald-700">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" /> On Time
                    </span>
                  ) : onTime === 'late' ? (
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold px-2 py-1 rounded-full bg-rose-50 text-rose-600">
                      <span className="h-1.5 w-1.5 rounded-full bg-rose-500 shrink-0" /> Late
                    </span>
                  ) : null}
                </Td>
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
  );
}
