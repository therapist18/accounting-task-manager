// Exports the Data Values panel (DataValuesPanel.tsx) for the currently selected client
// company to a styled .xlsx: a main "Contract Fields" sheet for scalar placeholders
// (Token / Field Label / Data Source / Value, grouped by group_label), plus one sheet per
// array block (e.g. Directors) with one row per existing entity and a few blank rows to add
// more. Round-trips through ccExcelImport.ts back into the same overrides/arrayData shape
// page.tsx already keeps in state.
import ExcelJS from "exceljs";
import {
  styleVarBanner, styleVarSectionRow, styleVarLeafHeaderRow, styleVarDataCell, getZebraFill,
  downloadVarWorkbook, buildVarInstructionsSheet,
} from "@/lib/excelVariablesExport";

// Structurally loose on purpose — callers pass page.tsx's `scalarPlaceholders`/`ccPlaceholders`,
// whose own static types (see page.tsx's PWithKey) don't guarantee label/group_label even
// though the runtime objects (built by page.tsx's ccPlaceholders map) always carry them.
type CcPlaceholder = { key: string; label?: string; group_label?: string; editable?: boolean; default_value?: string | null; is_block_start?: boolean; parent_name?: string | null; entity_type?: string | string[] };

const BLOCK_BLANK_ROWS = 10;
const MAIN_COLS = 4;

export const isCcComputedKey = (key: string): boolean =>
  key.endsWith("_vat_fee") || key.endsWith("_gross_fee") || key === "directors_acknowledgement_block";

export interface CcExportParams {
  companyName: string;
  scalarPlaceholders: CcPlaceholder[];
  allPlaceholders: CcPlaceholder[];
  resolvedValues: Record<string, string>;
  overrides: Record<string, string>;
  arrayData: Record<string, Record<string, string>[]>;
}

function buildMainSheet(workbook: ExcelJS.Workbook, params: CcExportParams) {
  const { companyName, scalarPlaceholders, resolvedValues, overrides } = params;
  const ws = workbook.addWorksheet("Contract Fields");
  ws.getColumn(1).width = 28;
  ws.getColumn(2).width = 32;
  ws.getColumn(3).width = 22;
  ws.getColumn(4).width = 50;
  let row = styleVarBanner(ws, "Contract Fields", companyName, MAIN_COLS) + 1;

  const scoped = scalarPlaceholders.filter((p) => !isCcComputedKey(p.key));
  const groups = new Map<string, CcPlaceholder[]>();
  for (const p of scoped) {
    const group = p.group_label || "General";
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group)!.push(p);
  }

  for (const [group, items] of groups.entries()) {
    row++;
    styleVarSectionRow(ws, row, group, MAIN_COLS);
    row++;
    const headerRow = ws.getRow(row);
    ["Token", "Field Label", "Data Source", "Value"].forEach((h, i) => { headerRow.getCell(i + 1).value = h; });
    styleVarLeafHeaderRow(headerRow);
    row++;
    items.forEach((p, idx) => {
      const locked = p.editable === false;
      const value = overrides[p.key] ?? resolvedValues[p.key] ?? p.default_value ?? "";
      const r = ws.getRow(row);
      r.getCell(1).value = p.key;
      r.getCell(2).value = p.label || p.key;
      r.getCell(3).value = "Master field";
      r.getCell(4).value = value;
      [1, 2, 3].forEach((c) => styleVarDataCell(r.getCell(c), getZebraFill(idx), { locked }));
      styleVarDataCell(r.getCell(4), getZebraFill(idx), { locked, wrap: true });
      row++;
    });
  }
}

function buildBlockSheets(workbook: ExcelJS.Workbook, params: CcExportParams) {
  const { allPlaceholders, arrayData } = params;
  const blocks = allPlaceholders.filter((p) => p.is_block_start);
  for (const block of blocks) {
    const children = allPlaceholders.filter((c) => c.parent_name === block.key);
    if (children.length === 0) continue;
    const ws = workbook.addWorksheet((block.label || block.key).slice(0, 31));
    children.forEach((c, i) => { ws.getColumn(i + 1).width = 26; });
    const totalCols = children.length;
    let row = styleVarBanner(ws, block.label || block.key, undefined, totalCols) + 1;
    row++;
    const headerRow = ws.getRow(row);
    children.forEach((c, i) => { headerRow.getCell(i + 1).value = c.label || c.key; });
    styleVarLeafHeaderRow(headerRow);
    row++;

    const rows = arrayData[block.key] || [];
    const totalRows = rows.length + BLOCK_BLANK_ROWS;
    for (let i = 0; i < totalRows; i++) {
      const dataRow = rows[i];
      const r = ws.getRow(row);
      children.forEach((c, colIdx) => {
        const cell = r.getCell(colIdx + 1);
        cell.value = dataRow ? (dataRow[c.key] ?? "") : "";
        styleVarDataCell(cell, getZebraFill(i), { wrap: true });
      });
      row++;
    }
  }
}

export async function generateCcContractExcel(params: CcExportParams): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Task Manager System";
  workbook.created = new Date();

  buildVarInstructionsSheet(workbook, [
    ["How This Template Works", ""],
    ["Contract Fields", "Edit the Value column for any field. Greyed-out rows are read-only/computed and are ignored on import."],
    ["Block sheets (e.g. Directors)", `One row per entity. ${BLOCK_BLANK_ROWS} blank rows are pre-formatted for adding more — just fill them in. A row left entirely blank on import is dropped.`],
    ["Token", "Do not edit the Token column on the Contract Fields sheet — it's used to match each row back to its field on import."],
    ["Saving", "Save as .xlsx before importing."],
  ]);

  buildMainSheet(workbook, params);
  buildBlockSheets(workbook, params);

  const base = params.companyName ? params.companyName.replace(/[^a-z0-9]+/gi, "_") : "Contract";
  await downloadVarWorkbook(workbook, `${base}_Contract_Fields_${new Date().toISOString().split("T")[0]}.xlsx`);
}
