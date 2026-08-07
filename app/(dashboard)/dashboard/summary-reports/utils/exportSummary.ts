// Client-side .xlsx export for the Summary Reports Dashboard table — mirrors the same
// visible columns / cell values the on-screen SummaryTable renders (resolveFieldValue,
// resolveMilestoneDate, computed-time formatting), so what the user exports always
// matches what they were looking at.
import * as XLSX from "xlsx";
import { formatDateCell, formatEstimatedMins } from "../../reports/components/reportCellRenderers";
import { resolveFieldValue, resolveMilestoneDate } from "../components/SummaryTable";
import type { SummaryColumnDef } from "../stageColumnConfig";

export const exportSummaryReportToExcel = ({
  tasks,
  columns,
  companies,
  departments = [],
  enhancedTasksData,
  getExpectedMinutesForTask,
  getActualTimeInfoForTask,
  getPromisedMinutesForTask,
  getPlannedExecutionDateForTask,
  getCurrentStageNameForTask,
  showTime,
  scopeName,
}: {
  tasks: any[];
  columns: SummaryColumnDef[];
  companies: Map<number, { name: string; prefix: string }>;
  departments?: any[];
  enhancedTasksData: Map<string, any>;
  getExpectedMinutesForTask: (task: any) => number;
  getActualTimeInfoForTask: (task: any) => { diffDays: number; isOverdue: boolean; deltaMinutes: number | null } | null;
  getPromisedMinutesForTask: (task: any) => number | null;
  getPlannedExecutionDateForTask: (task: any) => Date | null;
  getCurrentStageNameForTask?: (task: any) => string | null;
  showTime: boolean;
  scopeName?: string;
}) => {
  const rows = tasks.map((task, idx) => {
    const row: Record<string, any> = { '#': idx + 1 };
    columns.forEach(col => {
      let value: any = '';
      if (col.id === 'current_stage') {
        value = getCurrentStageNameForTask?.(task) ?? '';
      } else if (col.type === 'field') {
        value = resolveFieldValue(col.id, task, companies, enhancedTasksData, departments) ?? '';
      } else if (col.type === 'milestone') {
        value = formatDateCell(resolveMilestoneDate(task, col.milestone!.stageId), showTime);
      } else if (col.type === 'computed_time') {
        if (col.id === 'promised_time') {
          const minutes = getPromisedMinutesForTask?.(task);
          value = minutes ? formatEstimatedMins(minutes) : '';
        } else if (col.id === 'planned_execution') {
          const date = getPlannedExecutionDateForTask?.(task);
          value = date ? formatDateCell(date.toISOString(), showTime) : '';
        } else if (col.id === 'actual_execution') {
          const info = getActualTimeInfoForTask?.(task);
          value = info ? `${info.diffDays}d${info.isOverdue ? ' (Overdue)' : ''}` : '';
        } else if (col.id === 'execution_delta') {
          const info = getActualTimeInfoForTask?.(task);
          value = info && info.deltaMinutes != null
            ? `${info.deltaMinutes > 0 ? '+' : info.deltaMinutes < 0 ? '-' : ''}${formatEstimatedMins(Math.abs(info.deltaMinutes))}`
            : '';
        } else if (col.id === 'stages_time_expected') {
          const minutes = getExpectedMinutesForTask?.(task) ?? 0;
          value = minutes > 0 ? formatEstimatedMins(minutes) : '';
        }
      }
      row[col.label] = value;
    });
    return row;
  });

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [{ wch: 6 }, ...columns.map(() => ({ wch: 20 }))];
  XLSX.utils.book_append_sheet(wb, ws, "Summary");

  const timestamp = new Date().toISOString().split("T")[0];
  const scopeSuffix = scopeName ? `-${scopeName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}` : '';
  XLSX.writeFile(wb, `summary-report${scopeSuffix}-${timestamp}.xlsx`);
};
