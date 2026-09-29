// Exports the "Contract Fields" panel (ContractEditor.tsx) for the currently selected
// employee + job profile to a styled .xlsx: Basic Salary/Currency up top, then one section
// block per entity group (same grouping ContractEditor already computes), columns
// Token / Field Label / Data Source / Value. Non-editable placeholders are shown for
// reference but styled locked and skipped on import (see ecExcelImport.ts).
import ExcelJS from "exceljs";
import {
  styleVarBanner, styleVarSectionRow, styleVarLeafHeaderRow, styleVarDataCell, getZebraFill,
  addListDropdown, downloadVarWorkbook, buildVarInstructionsSheet,
} from "@/lib/excelVariablesExport";
import type { EcPlaceholder } from "./ecPlaceholders";
import { ENTITY_TYPES } from "@/lib/constants/entity-types";

export const EC_SHEET_NAME = "Contract Fields";
const CURRENCIES = ["KES", "USD", "GBP", "EUR"];
const COLS = 4; // Token / Field Label / Data Source / Value

const entityLabel = (entity: string) => entity === "none" ? "General" : (ENTITY_TYPES.find((t) => t.value === entity)?.label || entity);

function getSourceLabel(p: EcPlaceholder): string {
  switch (p.source_kind) {
    case "master_field": return p.settings_key || "Master field";
    case "settings_cascade": return p.settings_key || "Profile";
    case "job_profile": return p.settings_key || "Profile";
    case "offer": return p.offer_field || "Profile";
    default: return "Profile";
  }
}

export interface EcExportParams {
  employeeName: string;
  jobProfileName: string;
  placeholders: EcPlaceholder[]; // profileScopedPlaceholders
  placeholderValues: Record<string, string>; // resolved (override-applied) values, keyed by placeholder key
  basicSalary: number | null | undefined;
  currency: string | null | undefined;
}

export async function generateEcContractExcel(params: EcExportParams): Promise<void> {
  const { employeeName, jobProfileName, placeholders, placeholderValues, basicSalary, currency } = params;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Task Manager System";
  workbook.created = new Date();

  buildVarInstructionsSheet(workbook, [
    ["How This Template Works", ""],
    ["Value column", "Edit the Value column for any field. Greyed-out rows are read-only/computed and are ignored on import."],
    ["Basic Salary / Currency", "These drive salary-derived fields (gross pay, statutory deductions) elsewhere in the contract, so they get their own rows at the top."],
    ["Token", "Do not edit the Token column — it's used to match each row back to its field on import."],
    ["Saving", "Save as .xlsx before importing."],
  ]);

  const ws = workbook.addWorksheet(EC_SHEET_NAME);
  ws.getColumn(1).width = 28;
  ws.getColumn(2).width = 32;
  ws.getColumn(3).width = 22;
  ws.getColumn(4).width = 50;

  let row = styleVarBanner(ws, "Contract Fields", `${employeeName} — ${jobProfileName}`, COLS) + 1;

  // Compensation
  row++;
  styleVarSectionRow(ws, row, "Compensation", COLS);
  row++;
  const compHeader = ws.getRow(row);
  ["Token", "Field Label", "Data Source", "Value"].forEach((h, i) => { compHeader.getCell(i + 1).value = h; });
  styleVarLeafHeaderRow(compHeader);
  row++;
  const salaryRow = ws.getRow(row);
  salaryRow.getCell(1).value = "basic_salary";
  salaryRow.getCell(2).value = "Basic Salary";
  salaryRow.getCell(3).value = "Compensation";
  salaryRow.getCell(4).value = basicSalary ?? "";
  [1, 2, 3, 4].forEach((c) => styleVarDataCell(salaryRow.getCell(c), getZebraFill(0)));
  row++;
  const currencyRow = ws.getRow(row);
  currencyRow.getCell(1).value = "currency";
  currencyRow.getCell(2).value = "Currency";
  currencyRow.getCell(3).value = "Compensation";
  currencyRow.getCell(4).value = currency || "KES";
  [1, 2, 3].forEach((c) => styleVarDataCell(currencyRow.getCell(c), getZebraFill(1)));
  styleVarDataCell(currencyRow.getCell(4), getZebraFill(1));
  addListDropdown(currencyRow.getCell(4), CURRENCIES);
  row++;

  // Group placeholders by entity_type, same logic as ContractEditor.tsx's entityGroups.
  const groups = new Map<string, EcPlaceholder[]>();
  for (const p of placeholders) {
    const entity = p.entity_type && p.entity_type.length > 0 ? p.entity_type[0] : "none";
    if (!groups.has(entity)) groups.set(entity, []);
    groups.get(entity)!.push(p);
  }
  const sortedEntities = Array.from(groups.entries()).sort(([a], [b]) => (a === "none" ? 1 : b === "none" ? -1 : a.localeCompare(b)));

  for (const [entity, items] of sortedEntities) {
    row++;
    styleVarSectionRow(ws, row, entityLabel(entity), COLS);
    row++;
    const headerRow = ws.getRow(row);
    ["Token", "Field Label", "Data Source", "Value"].forEach((h, i) => { headerRow.getCell(i + 1).value = h; });
    styleVarLeafHeaderRow(headerRow);
    row++;
    items.forEach((p, idx) => {
      const r = ws.getRow(row);
      const locked = !p.editable;
      r.getCell(1).value = p.key;
      r.getCell(2).value = p.label;
      r.getCell(3).value = getSourceLabel(p);
      r.getCell(4).value = placeholderValues[p.key] ?? "";
      [1, 2, 3].forEach((c) => styleVarDataCell(r.getCell(c), getZebraFill(idx), { locked }));
      styleVarDataCell(r.getCell(4), getZebraFill(idx), { locked, wrap: true });
      if (!locked && p.type === "boolean") addListDropdown(r.getCell(4), ["true", "false"]);
      row++;
    });
  }

  const base = employeeName ? employeeName.replace(/[^a-z0-9]+/gi, "_") : "Contract";
  await downloadVarWorkbook(workbook, `${base}_Contract_Fields_${new Date().toISOString().split("T")[0]}.xlsx`);
}
