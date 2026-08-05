// @ts-nocheck
"use client";

import React from "react";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
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

const Th = ({ children }: { children: React.ReactNode }) => (
  <TableHead className="border-r border-b border-white/30 px-4 py-2.5 bg-custom-blue whitespace-nowrap">
    <span className="text-[11px] font-semibold uppercase tracking-wider text-white">{children}</span>
  </TableHead>
);

const Td = ({ children, idx, primary, className }: { children: React.ReactNode; idx: number; primary?: boolean; className?: string }) => (
  <TableCell className={cn(
    "px-4 py-2.5 border-r border-b border-slate-200 text-sm whitespace-nowrap",
    primary ? "font-semibold text-slate-900" : "text-slate-600",
    idx % 2 === 0 ? "bg-white" : "bg-slate-100/50",
    "group-hover:bg-blue-50/50",
    className
  )}>
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
  if (!tasks.length) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center bg-white rounded-xl border border-slate-200">
        <p className="text-sm font-semibold text-slate-500">{emptyLabel}</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 shadow-sm overflow-x-auto custom-scrollbar">
      <Table className="border-separate border-spacing-0">
        <TableHeader>
          <TableRow className="hover:bg-transparent border-0">
            <Th>#</Th>
            <Th>Task ID</Th>
            <Th>Job Description</Th>
            {showCompanyColumn && <Th>Company</Th>}
            <Th>Department</Th>
            <Th>Sub-Department</Th>
            <Th>Class</Th>
            <Th>Sub Class</Th>
            <Th>Status</Th>
            <Th>Current Stage</Th>
            <Th>Duration</Th>
            <Th>Application Type</Th>
            <Th>Registered</Th>
            <Th>Req Sent</Th>
            <Th>Confirmed</Th>
            <Th>Completed</Th>
            <Th>On Time?</Th>
            <Th>Open</Th>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tasks.map((task, idx) => {
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

            let onTime: 'on_time' | 'late' | null = null;
            if (completedRaw && registered && getExpectedMinutesForTask) {
              const start = parseDateSafe(registered);
              const end = parseDateSafe(completedRaw);
              const expectedMinutes = getExpectedMinutesForTask(task);
              if (start && end && expectedMinutes > 0) {
                const elapsedMinutes = Math.max(0, Math.floor((end.getTime() - start.getTime()) / 60000));
                onTime = elapsedMinutes <= expectedMinutes ? 'on_time' : 'late';
              }
            }

            return (
              <TableRow key={task.id} className={cn("group border-0 transition-colors", idx % 2 === 0 ? "bg-white" : "bg-slate-100/50", "hover:bg-blue-50/50")}>
                <Td idx={idx}>{idx + 1}</Td>
                <Td idx={idx} primary>{task.id}</Td>
                <Td idx={idx} primary className="whitespace-normal min-w-[180px]">{task.job_description}</Td>
                {showCompanyColumn && <Td idx={idx}>{company?.name || task.company_name}</Td>}
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
