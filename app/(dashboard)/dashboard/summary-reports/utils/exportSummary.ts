// @ts-nocheck
// Excel (.xlsx, via ExcelJS) and PDF (via jsPDF + jspdf-autotable) export for the Summary
// Reports Dashboard table — mirrors the same visible columns / cell values / sub-department
// grouping the on-screen SummaryTable renders (resolveFieldValue, resolveMilestoneDate,
// computed-time formatting), so what the user exports always matches what they were looking
// at. Styling follows the same conventions ReportsPage's officer/manager/client exports use
// (title/subtitle banner, colored group headers, chunked landscape PDF columns, status-colored
// cell text), just themed in this page's own accent (#376BAE) instead of per-report-type ones.
import ExcelJS from "exceljs";
import { formatDateCell, formatEstimatedMins } from "../components/reportCellRenderers";
import { resolveFieldValue, resolveMilestoneDate } from "../components/SummaryTable";
import { getSubDepartmentDisplay } from "../../tasks/overall-view/tableUtils";
import type { SummaryColumnDef } from "../stageColumnConfig";

const ACCENT_HEX = "376BAE";
const ACCENT_RGB: [number, number, number] = [55, 107, 174];

export interface SummaryExportParams {
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
  getCurrentStageFollowUpForTask?: (task: any) => string | null;
  getStaffName?: (userId: any) => string;
  getEnhancedStatusForTask?: (task: any) => { date: Date | null; documentType: string | null; daysRemaining: number | null };
  showTime: boolean;
  scopeName?: string;
  statusLabel?: string;
}

type ExportCellKind = 'normal' | 'missing' | 'na' | 'overdue' | 'delta-pos' | 'delta-neg' | 'ontime' | 'promised';

// Resolves one cell to both its display text and a semantic "kind" — the same states
// SummaryTable colors on screen (Missing / N/A / Overdue / Δ sign / Promised Time) — so the
// Excel and PDF renderers below can color-code cells without re-deriving that logic twice.
const resolveExportCell = (col: SummaryColumnDef, task: any, p: SummaryExportParams): { text: string; kind: ExportCellKind } => {
  const isNotApplicableColumn = col.id === 'class_name' || col.id === 'subclass_name';
  let text = '';

  if (col.id === 'current_stage') {
    text = p.getCurrentStageNameForTask?.(task) ?? '';
  } else if (col.type === 'field') {
    text = resolveFieldValue(col.id, task, p.companies, p.enhancedTasksData, p.departments, {
      getStaffName: p.getStaffName,
      getCurrentStageFollowUpForTask: p.getCurrentStageFollowUpForTask,
      getEnhancedStatusForTask: p.getEnhancedStatusForTask,
    }) ?? '';
  } else if (col.type === 'milestone') {
    const raw = formatDateCell(resolveMilestoneDate(task, col.milestone!.stageId), p.showTime);
    text = raw === '—' ? '' : raw;
  } else if (col.type === 'computed_time') {
    if (col.id === 'promised_time') {
      const minutes = p.getPromisedMinutesForTask?.(task);
      if (minutes) return { text: formatEstimatedMins(minutes), kind: 'promised' };
    } else if (col.id === 'planned_execution') {
      const date = p.getPlannedExecutionDateForTask?.(task);
      text = date ? formatDateCell(date.toISOString(), p.showTime) : '';
    } else if (col.id === 'actual_execution') {
      const info = p.getActualTimeInfoForTask?.(task);
      if (info) {
        const base = `${info.diffDays}d`;
        if (info.isOverdue) return { text: `${base} (Overdue)`, kind: 'overdue' };
        text = base;
      }
    } else if (col.id === 'execution_delta') {
      const info = p.getActualTimeInfoForTask?.(task);
      if (info && info.deltaMinutes != null) {
        if (info.deltaMinutes === 0) return { text: 'On time', kind: 'ontime' };
        const sign = info.deltaMinutes > 0 ? '+' : '-';
        return { text: `${sign}${formatEstimatedMins(Math.abs(info.deltaMinutes))}`, kind: info.deltaMinutes > 0 ? 'delta-pos' : 'delta-neg' };
      }
    } else if (col.id === 'stages_time_expected') {
      const minutes = p.getExpectedMinutesForTask?.(task) ?? 0;
      text = minutes > 0 ? formatEstimatedMins(minutes) : '';
    }
  }

  if (!text) return isNotApplicableColumn ? { text: 'N/A', kind: 'na' } : { text: 'Missing', kind: 'missing' };
  return { text, kind: 'normal' };
};

// Same grouping SummaryTable uses on screen (subDeptGroups), just over the full exported set
// instead of one page — N/A sorts last, everything else alphabetical.
const buildSubDeptGroups = (tasks: any[], departments: any[]): { name: string; tasks: any[] }[] => {
  const map = new Map<string, any[]>();
  for (const task of tasks) {
    const name = getSubDepartmentDisplay(task, departments);
    if (!map.has(name)) map.set(name, []);
    map.get(name)!.push(task);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => (a === 'N/A' ? 1 : b === 'N/A' ? -1 : a.localeCompare(b)))
    .map(([name, groupTasks]) => ({ name, tasks: groupTasks }));
};

const buildExportFileName = (scopeName: string | undefined, ext: string): string => {
  const timestamp = new Date().toISOString().split("T")[0];
  const scopeSuffix = scopeName ? `-${scopeName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}` : '';
  return `summary-report${scopeSuffix}-${timestamp}.${ext}`;
};

const downloadBlob = (blob: Blob, filename: string) => {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
};

export const exportSummaryReportToExcel = async (params: SummaryExportParams): Promise<void> => {
  const { tasks, columns, departments = [], scopeName, statusLabel } = params;
  const groups = buildSubDeptGroups(tasks, departments);
  const totalTasks = tasks.length;
  const numDataCols = columns.length + 1; // +1 for the leading '#' column

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Task Manager System';
  wb.created = new Date();
  const ws = wb.addWorksheet('Summary Report');

  // Title row
  ws.mergeCells(1, 1, 1, numDataCols);
  const titleCell = ws.getCell(1, 1);
  titleCell.value = 'SUMMARY REPORTS DASHBOARD';
  titleCell.font = { name: 'Calibri', bold: true, size: 18, color: { argb: 'FFFFFFFF' } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${ACCENT_HEX}` } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 40;

  // Subtitle row
  ws.mergeCells(2, 1, 2, numDataCols);
  const subCell = ws.getCell(2, 1);
  const dateStr = new Date().toLocaleString();
  subCell.value = `${scopeName || 'All Departments'}  ·  ${statusLabel || 'All Applications'}  ·  Generated: ${dateStr}  ·  Total: ${totalTasks} task${totalTasks === 1 ? '' : 's'}`;
  subCell.font = { name: 'Calibri', size: 10, color: { argb: 'FF475569' } };
  subCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
  subCell.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(2).height = 20;

  ws.addRow([]);
  ws.getRow(3).height = 6;

  let currentRow = 4;

  for (const group of groups) {
    if (group.tasks.length === 0) continue;
    const isUnalloc = group.name === 'N/A';
    const groupFg = isUnalloc ? 'FF64748B' : `FF${ACCENT_HEX}`;

    // Sub-department group banner
    ws.mergeCells(currentRow, 1, currentRow, numDataCols);
    const ghCell = ws.getCell(currentRow, 1);
    ghCell.value = `  ${(isUnalloc ? 'Unassigned' : group.name).toUpperCase()}    (${group.tasks.length} ${group.tasks.length === 1 ? 'task' : 'tasks'})`;
    ghCell.font = { name: 'Calibri', bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
    ghCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: groupFg } };
    ghCell.alignment = { horizontal: 'left', vertical: 'middle' };
    ws.getRow(currentRow).height = 24;
    currentRow++;

    // Column headers
    const hRow = ws.addRow(['#', ...columns.map(c => c.label)]);
    hRow.height = 24;
    hRow.eachCell(cell => {
      cell.font = { name: 'Calibri', bold: true, size: 9, color: { argb: 'FF1E293B' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = { bottom: { style: 'medium', color: { argb: 'FF94A3B8' } }, right: { style: 'hair', color: { argb: 'FFE2E8F0' } } };
    });
    currentRow++;

    // Data rows
    group.tasks.forEach((task, idx) => {
      const cells = columns.map(col => resolveExportCell(col, task, params));
      const dRow = ws.addRow([idx + 1, ...cells.map(c => c.text)]);
      dRow.height = 16;
      const bg = idx % 2 === 0 ? 'FFFFFFFF' : 'FFF8FAFC';
      dRow.eachCell((cell, colNum) => {
        const kind = colNum === 1 ? 'normal' : cells[colNum - 2].kind;
        let colorArgb = 'FF334155';
        let isBold = false;
        let isItalic = false;
        if (kind === 'missing') { colorArgb = 'FFDC2626'; isBold = true; }
        else if (kind === 'na') { colorArgb = 'FF94A3B8'; isItalic = true; }
        else if (kind === 'overdue' || kind === 'delta-pos') { colorArgb = 'FFDC2626'; isBold = true; }
        else if (kind === 'delta-neg') { colorArgb = 'FF16A34A'; isBold = true; }
        else if (kind === 'ontime') { colorArgb = 'FF94A3B8'; }
        else if (kind === 'promised') { colorArgb = 'FF92400E'; isBold = true; }
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
        cell.font = { name: 'Calibri', size: 9, bold: isBold, italic: isItalic, color: { argb: colorArgb } };
        cell.alignment = { horizontal: colNum === 1 ? 'center' : 'left', vertical: 'middle' };
        cell.border = { bottom: { style: 'hair', color: { argb: 'FFE2E8F0' } }, right: { style: 'hair', color: { argb: 'FFE2E8F0' } } };
      });
      currentRow++;
    });

    // Spacer between groups
    ws.addRow([]);
    ws.getRow(currentRow).height = 8;
    currentRow++;
  }

  // Column widths
  ws.getColumn(1).width = 5;
  columns.forEach((col, i) => {
    const wide = col.primary || col.id === 'job_description' || col.id === 'current_stage';
    ws.getColumn(i + 2).width = wide ? 30 : col.type === 'milestone' ? 16 : 20;
  });
  ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 3 }];

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  downloadBlob(blob, buildExportFileName(scopeName, 'xlsx'));
};

export const exportSummaryReportToPDF = async (params: SummaryExportParams): Promise<void> => {
  const { tasks, columns, departments = [], scopeName, statusLabel } = params;
  const groups = buildSubDeptGroups(tasks, departments);
  const totalTasks = tasks.length;
  if (totalTasks === 0) return;

  // Dynamic import to keep these two libraries out of the main bundle until an export is
  // actually requested — same pattern ReportsPage's PDF export uses.
  const { default: jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  const GREY_DARK: [number, number, number] = [15, 23, 42];
  const GREY_MID: [number, number, number] = [71, 85, 105];
  const GREY_LIGHT: [number, number, number] = [226, 232, 240];
  const WHITE: [number, number, number] = [255, 255, 255];
  const ROW_ALT: [number, number, number] = [248, 250, 252];
  const RED: [number, number, number] = [220, 38, 38];
  const GREEN: [number, number, number] = [22, 163, 74];
  const AMBER: [number, number, number] = [146, 64, 14];
  const GRAY_TEXT: [number, number, number] = [148, 163, 184];

  const dateStr = new Date().toLocaleString();
  const scopeLabel = scopeName || 'All Departments';
  const statusText = statusLabel || 'All Applications';

  const paintPageHeader = () => {
    doc.setFillColor(...ACCENT_RGB);
    doc.rect(0, 0, pageW, 3, 'F');
    doc.setFillColor(255, 255, 255);
    doc.rect(0, 3, pageW, 20, 'F');

    doc.setTextColor(...GREY_DARK);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('SUMMARY REPORTS DASHBOARD', 14, 15);

    doc.setTextColor(...GREY_MID);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.text(`${scopeLabel}  ·  ${statusText}  ·  ${dateStr}  ·  ${totalTasks} task${totalTasks === 1 ? '' : 's'}`, 14, 20.5);

    doc.setDrawColor(...GREY_LIGHT);
    doc.setLineWidth(0.3);
    doc.line(10, 23, pageW - 10, 23);
  };

  const paintFooter = (pageNum: number) => {
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.3);
    doc.line(10, pageH - 8, pageW - 10, pageH - 8);
    doc.setFontSize(6.5);
    doc.setTextColor(148, 163, 184);
    doc.setFont('helvetica', 'normal');
    doc.text(`Summary Reports Dashboard  ·  ${scopeLabel}  ·  ${dateStr}`, 14, pageH - 3.5);
    doc.text(`Page ${pageNum}`, pageW - 14, pageH - 3.5, { align: 'right' });
  };

  paintPageHeader();
  let startY = 26;

  // Summary Reports can carry a lot of columns at once (milestones + computed-time columns on
  // top of the base fields) — chunk them the same way ReportsPage's export does so each chunk
  // stays wide enough to read rather than truncating dozens of slivered columns onto one page.
  const CHUNK = 9;
  const colChunks: SummaryColumnDef[][] = [];
  for (let i = 0; i < columns.length; i += CHUNK) colChunks.push(columns.slice(i, i + CHUNK));
  if (colChunks.length === 0) colChunks.push([]);

  const INDEX_COL_PDF_WIDTH = 7;
  const getColWeight = (col: SummaryColumnDef): number => {
    if (col.type === 'milestone') return 1.1;
    if (col.primary || col.id === 'job_description' || col.id === 'current_stage') return 1.6;
    return 1;
  };

  for (const group of groups) {
    if (group.tasks.length === 0) continue;
    const isUnalloc = group.name === 'N/A';
    const gColor: [number, number, number] = isUnalloc ? [100, 116, 139] : ACCENT_RGB;
    const groupLabelBase = isUnalloc ? 'UNASSIGNED' : group.name.toUpperCase();

    for (let ci = 0; ci < colChunks.length; ci++) {
      const chunk = colChunks[ci];
      const isFirstChunk = ci === 0;

      if (startY > pageH - 40) {
        doc.addPage();
        paintPageHeader();
        startY = 26;
      }

      // Group banner
      doc.setFillColor(...gColor);
      doc.roundedRect(8, startY, pageW - 16, 7, 1.5, 1.5, 'F');
      doc.setTextColor(...WHITE);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      const groupLabel = isFirstChunk
        ? groupLabelBase
        : `${groupLabelBase} (cont. — cols ${ci * CHUNK + 1}–${Math.min(ci * CHUNK + chunk.length, columns.length)})`;
      doc.text(`  ${groupLabel}`, 11, startY + 4.8);
      if (isFirstChunk) doc.text(`${group.tasks.length} task${group.tasks.length !== 1 ? 's' : ''}`, pageW - 11, startY + 4.8, { align: 'right' });
      startY += 9.5;

      const headers = ['#', ...chunk.map(c => c.label)];
      const cellModel = group.tasks.map((task: any) => chunk.map(col => resolveExportCell(col, task, params)));
      const rows = cellModel.map((rowCells, i) => [String(i + 1), ...rowCells.map(c => c.text)]);

      const availableWidth = (pageW - 16) - INDEX_COL_PDF_WIDTH;
      const weights = chunk.map(getColWeight);
      const totalWeight = weights.reduce((a, b) => a + b, 0) || 1;
      const columnStyles: Record<number, any> = { 0: { halign: 'center', cellWidth: INDEX_COL_PDF_WIDTH } };
      chunk.forEach((_c, idx) => { columnStyles[idx + 1] = { cellWidth: Math.max(14, (availableWidth * weights[idx]) / totalWeight) }; });

      autoTable(doc, {
        startY,
        head: [headers],
        body: rows,
        styles: {
          fontSize: 6.5,
          cellPadding: { top: 1.5, right: 2, bottom: 1.5, left: 2 },
          overflow: 'linebreak',
          lineColor: GREY_LIGHT,
          lineWidth: 0.15,
          valign: 'middle',
        },
        headStyles: {
          fillColor: ACCENT_RGB,
          textColor: WHITE,
          fontStyle: 'bold',
          fontSize: 6.5,
          halign: 'center',
          minCellHeight: 7,
          lineWidth: 0,
        },
        bodyStyles: { textColor: [31, 41, 55], lineColor: [241, 245, 249] },
        alternateRowStyles: { fillColor: ROW_ALT },
        columnStyles,
        margin: { left: 8, right: 8, top: 26, bottom: 12 },
        didParseCell: (data: any) => {
          if (data.section !== 'body' || data.column.index === 0) return;
          const kind = cellModel[data.row.index]?.[data.column.index - 1]?.kind;
          if (kind === 'missing' || kind === 'overdue' || kind === 'delta-pos') {
            data.cell.styles.textColor = RED;
            data.cell.styles.fontStyle = 'bold';
          } else if (kind === 'na' || kind === 'ontime') {
            data.cell.styles.textColor = GRAY_TEXT;
            data.cell.styles.fontStyle = 'italic';
          } else if (kind === 'delta-neg') {
            data.cell.styles.textColor = GREEN;
            data.cell.styles.fontStyle = 'bold';
          } else if (kind === 'promised') {
            data.cell.styles.textColor = AMBER;
            data.cell.styles.fontStyle = 'bold';
          }
        },
        didDrawPage: () => {
          const pg = doc.getNumberOfPages();
          paintPageHeader();
          paintFooter(pg);
        },
      });

      startY = (doc as any).lastAutoTable.finalY + 5;

      if (ci < colChunks.length - 1) {
        doc.addPage();
        paintPageHeader();
        startY = 26;
      }
    }

    startY += 3;
  }

  paintFooter(doc.getNumberOfPages());
  doc.save(buildExportFileName(scopeName, 'pdf'));
};
