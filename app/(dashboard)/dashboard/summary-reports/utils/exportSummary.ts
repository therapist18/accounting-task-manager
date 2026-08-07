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
  enhancedTasksData,
  getExpectedMinutesForTask,
  getActualTimeInfoForTask,
  showTime,
  scopeName,
}: {
  tasks: any[];
  columns: SummaryColumnDef[];
  companies: Map<number, { name: string; prefix: string }>;
  enhancedTasksData: Map<string, any>;
  getExpectedMinutesForTask: (task: any) => number;
  getActualTimeInfoForTask: (task: any) => { diffDays: number; isOverdue: boolean } | null;
  showTime: boolean;
  scopeName?: string;
}) => {
  const rows = tasks.map((task, idx) => {
    const row: Record<string, any> = { '#': idx + 1 };
    columns.forEach(col => {
      let value: any = '';
      if (col.type === 'field') {
        value = resolveFieldValue(col.id, task, companies, enhancedTasksData) ?? '';
      } else if (col.type === 'milestone') {
        value = formatDateCell(resolveMilestoneDate(task, col.milestone!.stageId), showTime);
      } else if (col.type === 'computed_time') {
        if (col.id === 'planned_execution') {
          const minutes = getExpectedMinutesForTask?.(task) ?? 0;
          value = minutes > 0 ? formatEstimatedMins(minutes) : '';
        } else if (col.id === 'actual_execution') {
          const info = getActualTimeInfoForTask?.(task);
          value = info ? `${info.diffDays}d${info.isOverdue ? ' (Overdue)' : ''}` : '';
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
