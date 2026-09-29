// Shared styling + dropdown mechanics for the "export a record's variables to Excel, edit
// offline, import back" flow used by CV Generator, Employment Contracts and Consultancy
// Contracts. Mirrors this project's existing export conventions (see
// app/(dashboard)/dashboard/emails/components/excelExport.ts's ACCENT_HEX/banner/zebra shape)
// rather than inventing a new palette, and lifts the dropdown/lookup-sheet mechanics from
// bcl-registry's bank accounts template (app/banks/company-related-banks/bankExcelImport.ts)
// — a hidden lookup sheet holding flat option lists (plain dropdowns) or, for two-level
// dependencies, one named range per parent key that a child column's list formula reaches via
// INDIRECT().
//
// Every export in this family is a single-record round trip (one CV / one employee+job
// profile / one company's contract), not a bulk multi-row template — so most columns only need
// `addListDropdown`, not `addDependentDropdown`. The latter exists for the rare case a sheet's
// own rows have a real parent/child relationship (e.g. a per-row lookup scoped to that row's
// own entity), not for spanning multiple unrelated parent records the way the bank template's
// per-row Company/Bank picks do.
import ExcelJS from "exceljs";
import { saveAs } from "file-saver";

export const ACCENT_HEX = "376BAE"; // custom-blue, matches emails/components/excelExport.ts

export const EXCEL_VAR_COLORS = {
  titleBg: `FF${ACCENT_HEX}`,
  titleText: "FFFFFFFF",
  subtitleBg: "FFF8FAFC",
  subtitleText: "FF475569",
  sectionBg: "FF1E3A8A",
  leafHeaderBg: "FFE2E8F0",
  leafHeaderText: "FF1E293B",
  border: "FFE2E8F0",
  evenRow: "FFFFFFFF",
  oddRow: "FFF8FAFC",
  // Read-only / computed / auto-filled cells — same grey-italic treatment the bank
  // template uses for its "(auto)" ID columns.
  lockedFill: "FFF1F5F9",
  lockedText: "FF94A3B8",
  bodyText: "FF334155",
} as const;

// ─── Column helpers ─────────────────────────────────────────────────────────────────
export const excelColumnLetter = (n: number): string => {
  let s = "";
  while (n > 0) { n--; s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26); }
  return s;
};

export const excelThinBorder = (argb: string = EXCEL_VAR_COLORS.border) => ({
  top: { style: "thin" as const, color: { argb } },
  left: { style: "thin" as const, color: { argb } },
  right: { style: "thin" as const, color: { argb } },
  bottom: { style: "thin" as const, color: { argb } },
});

export const getZebraFill = (rowIndex: number): string =>
  rowIndex % 2 === 0 ? EXCEL_VAR_COLORS.evenRow : EXCEL_VAR_COLORS.oddRow;

// ─── Banner / header styling ────────────────────────────────────────────────────────
/** Merged title (row 1) + optional subtitle (row 2), sized to the sheet's actual column count. */
export function styleVarBanner(worksheet: ExcelJS.Worksheet, title: string, subtitle: string | undefined, totalCols: number) {
  worksheet.mergeCells(1, 1, 1, totalCols);
  const titleCell = worksheet.getCell(1, 1);
  titleCell.value = title;
  titleCell.font = { name: "Calibri", bold: true, size: 16, color: { argb: EXCEL_VAR_COLORS.titleText } };
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: EXCEL_VAR_COLORS.titleBg } };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };
  worksheet.getRow(1).height = 34;

  if (!subtitle) return 1;
  worksheet.mergeCells(2, 1, 2, totalCols);
  const subtitleCell = worksheet.getCell(2, 1);
  subtitleCell.value = subtitle;
  subtitleCell.font = { name: "Calibri", size: 10, italic: true, color: { argb: EXCEL_VAR_COLORS.subtitleText } };
  subtitleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: EXCEL_VAR_COLORS.subtitleBg } };
  subtitleCell.alignment = { horizontal: "center", vertical: "middle" };
  worksheet.getRow(2).height = 18;
  return 2;
}

/** A colored, bold, white-on-blue section/group header spanning `totalCols`. */
export function styleVarSectionRow(worksheet: ExcelJS.Worksheet, rowNum: number, label: string, totalCols: number, bgArgb: string = EXCEL_VAR_COLORS.sectionBg) {
  worksheet.mergeCells(rowNum, 1, rowNum, totalCols);
  const cell = worksheet.getCell(rowNum, 1);
  cell.value = label;
  cell.font = { name: "Calibri", bold: true, size: 11, color: { argb: "FFFFFFFF" } };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bgArgb } };
  cell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  worksheet.getRow(rowNum).height = 22;
}

/** A leaf column-label header row (field names above a data table). */
export function styleVarLeafHeaderRow(row: ExcelJS.Row) {
  row.eachCell((cell) => {
    cell.font = { name: "Calibri", bold: true, size: 10, color: { argb: EXCEL_VAR_COLORS.leafHeaderText } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: EXCEL_VAR_COLORS.leafHeaderBg } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = { ...excelThinBorder(), bottom: { style: "medium", color: { argb: "FF94A3B8" } } };
  });
  row.height = 24;
}

// ─── Data cell styling ──────────────────────────────────────────────────────────────
export interface VarCellInfo {
  locked?: boolean;
  align?: "left" | "center" | "right";
  bold?: boolean;
  wrap?: boolean;
}

/** Styles one data cell — `locked` (computed/read-only fields) gets the grey-italic treatment; otherwise a plain zebra row. */
export function styleVarDataCell(cell: ExcelJS.Cell, rowFillArgb: string, info: VarCellInfo = {}) {
  cell.font = {
    name: "Calibri", size: 10, bold: !!info.bold,
    ...(info.locked ? { italic: true, color: { argb: EXCEL_VAR_COLORS.lockedText } } : { color: { argb: EXCEL_VAR_COLORS.bodyText } }),
  };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: info.locked ? EXCEL_VAR_COLORS.lockedFill : rowFillArgb } };
  cell.alignment = { vertical: "middle", horizontal: info.align || "left", wrapText: !!info.wrap };
  cell.border = excelThinBorder();
}

// ─── Dropdowns ──────────────────────────────────────────────────────────────────────
/**
 * Plain list validation on one cell (or, called per-row, one column). `optionsOrRange` is
 * either an inline array of choices (short fixed lists — ExcelJS/Excel caps inline list
 * formulae around ~255 chars, so keep these short) or a sheet range string
 * (e.g. "'_Lookup'!$A$2:$A$10") for longer/derived lists.
 */
export function addListDropdown(cell: ExcelJS.Cell, optionsOrRange: string[] | string, allowBlank = true) {
  const formula = Array.isArray(optionsOrRange) ? `"${optionsOrRange.join(",")}"` : optionsOrRange;
  cell.dataValidation = { type: "list", allowBlank, formulae: [formula] };
}

/**
 * Cascading dropdown: writes `childOptionsByParent` onto a hidden lookup sheet (one column per
 * parent key, named range `${namePrefix}_${parentKey}`), then wires `childCell` to
 * `=INDIRECT("${namePrefix}_"&parentCellRef)`. Mirrors bankExcelImport.ts's BR_<bankId>/
 * CB_<companyId> pattern. Returns the lookup sheet's next free column index, so a caller
 * writing several dependent groups onto the same lookup sheet can chain calls.
 */
export function addDependentDropdown(params: {
  workbook: ExcelJS.Workbook;
  lookupSheet: ExcelJS.Worksheet;
  namePrefix: string;
  childOptionsByParent: Map<string, string[]>;
  startCol: number;
  childCell: ExcelJS.Cell;
  parentCellRef: string; // e.g. "B5"
}): number {
  const { workbook, lookupSheet, namePrefix, childOptionsByParent, startCol, childCell, parentCellRef } = params;
  let col = startCol;
  for (const [parentKey, options] of childOptionsByParent.entries()) {
    const values = options.length > 0 ? options : ["—"];
    values.forEach((v, i) => { lookupSheet.getCell(i + 1, col).value = v; });
    const letter = excelColumnLetter(col);
    const safeKey = String(parentKey).replace(/[^a-zA-Z0-9_]/g, "_");
    workbook.definedNames.add(`'${lookupSheet.name}'!$${letter}$1:$${letter}$${values.length}`, `${namePrefix}_${safeKey}`);
    col++;
  }
  childCell.dataValidation = { type: "list", allowBlank: true, formulae: [`=INDIRECT("${namePrefix}_"&${parentCellRef})`] };
  return col;
}

// ─── Import cell reading ────────────────────────────────────────────────────────────
/** Reads one cell as a trimmed string, handling formula-result cells, Dates and rich text. */
export function readVarCell(wsRow: ExcelJS.Row, colIdx: number): string {
  if (!colIdx) return "";
  const v = wsRow.getCell(colIdx).value as any;
  if (v === null || v === undefined) return "";
  if (typeof v === "object" && "formula" in v) {
    const res = v.result;
    if (res === null || res === undefined) return "";
    if (typeof res === "object" && res && "error" in res) return "";
    return res instanceof Date ? res.toISOString().split("T")[0] : String(res).trim();
  }
  if (v instanceof Date) return v.toISOString().split("T")[0];
  if (typeof v === "object" && "text" in v) return String(v.text || "").trim();
  if (typeof v === "object" && "richText" in v) return (v.richText || []).map((r: any) => r.text || "").join("").trim();
  return String(v).trim();
}

/** Maps trimmed lower-cased header text (from `headerRow`) -> 1-based column index. */
export function buildVarHeaderMap(ws: ExcelJS.Worksheet, headerRow: number): Map<string, number> {
  const map = new Map<string, number>();
  ws.getRow(headerRow).eachCell({ includeEmpty: false }, (cell, colIdx) => {
    const label = String(cell.value ?? "").trim().toLowerCase();
    if (label) map.set(label, colIdx);
  });
  return map;
}

// ─── Download ───────────────────────────────────────────────────────────────────────
export async function downloadVarWorkbook(workbook: ExcelJS.Workbook, filename: string): Promise<void> {
  const buffer = await workbook.xlsx.writeBuffer();
  saveAs(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), filename);
}

/** A simple Instructions sheet, same shape as bankExcelImport.ts's buildInstructionsSheet. */
export function buildVarInstructionsSheet(workbook: ExcelJS.Workbook, rows: [string, string][]) {
  const sheet = workbook.addWorksheet("Instructions");
  sheet.getColumn(1).width = 28;
  sheet.getColumn(2).width = 80;
  rows.forEach(([a, b], i) => {
    const r = sheet.addRow([a, b]);
    r.getCell(1).font = i === 0 ? { bold: true, size: 13 } : { bold: true };
    r.getCell(1).alignment = { wrapText: true, vertical: "top" };
    r.getCell(2).alignment = { wrapText: true, vertical: "top" };
  });
  return sheet;
}
