// Exports the current CV draft (cvData) to a styled .xlsx: a "Contact & Details" sheet for
// every scalar field, and one sheet per array section (Experience, Education, ...), each with
// its existing entries plus blank pre-formatted rows for adding more. Round-trips through
// cvExcelImport.ts back into the same cvData shape.
import ExcelJS from "exceljs";
import {
  styleVarBanner, styleVarSectionRow, styleVarLeafHeaderRow, styleVarDataCell, getZebraFill,
  addListDropdown, downloadVarWorkbook, buildVarInstructionsSheet,
} from "@/lib/excelVariablesExport";
import {
  SCALAR_FIELD_DEFS, ARRAY_SECTION_DEFS, getScalarValue, responsibilitiesToLines,
  PROFICIENCY_LEVELS, COMMON_LANGUAGES,
} from "./cvVariablesConfig";
import type { CvData } from "./cvGeneratorData";

const BLANK_ROWS_PER_SECTION = 15;

function buildContactSheet(workbook: ExcelJS.Workbook, cvData: CvData) {
  const ws = workbook.addWorksheet("Contact & Details");
  ws.getColumn(1).width = 26;
  ws.getColumn(2).width = 60;
  let row = styleVarBanner(ws, "Contact & Details", cvData.personalInfo?.fullName || undefined, 2) + 1;

  const groups = ["Contact", "Personal Details", "Summary & Declaration"] as const;
  for (const group of groups) {
    row++;
    styleVarSectionRow(ws, row, group, 2);
    row++;
    const headerRow = ws.getRow(row);
    headerRow.getCell(1).value = "Field";
    headerRow.getCell(2).value = "Value";
    styleVarLeafHeaderRow(headerRow);
    row++;
    const fields = SCALAR_FIELD_DEFS.filter((f) => f.group === group);
    fields.forEach((f, idx) => {
      const value = getScalarValue(cvData, f.path);
      const r = ws.getRow(row);
      r.getCell(1).value = f.label;
      styleVarDataCell(r.getCell(1), getZebraFill(idx), { bold: true });
      if (f.type === "boolean") {
        r.getCell(2).value = value ? "Yes" : "No";
        addListDropdown(r.getCell(2), ["Yes", "No"]);
      } else {
        r.getCell(2).value = value ?? "";
      }
      styleVarDataCell(r.getCell(2), getZebraFill(idx), { wrap: f.type === "textarea" });
      if (f.type === "textarea") r.height = 44;
      row++;
    });
  }
}

function buildArraySheet(workbook: ExcelJS.Workbook, sectionId: string, cvData: CvData) {
  const section = ARRAY_SECTION_DEFS.find((s) => s.id === sectionId)!;
  const ws = workbook.addWorksheet(section.label.slice(0, 31));
  const totalCols = section.fields.length;
  section.fields.forEach((f, i) => { ws.getColumn(i + 1).width = f.type === "textarea" || f.type === "list" ? 40 : 22; });
  let row = styleVarBanner(ws, section.label, undefined, totalCols) + 1;
  row++;
  const headerRow = ws.getRow(row);
  section.fields.forEach((f, i) => { headerRow.getCell(i + 1).value = f.label; });
  styleVarLeafHeaderRow(headerRow);
  row++;

  const items: any[] = (cvData as any)[sectionId] || [];
  const totalRows = Math.max(items.length, 0) + BLANK_ROWS_PER_SECTION;
  for (let i = 0; i < totalRows; i++) {
    const item = items[i];
    const r = ws.getRow(row);
    section.fields.forEach((f, colIdx) => {
      const cell = r.getCell(colIdx + 1);
      let value = "";
      if (item) {
        value = f.type === "list" ? responsibilitiesToLines(item[f.key]).join("\n") : (item[f.key] ?? "");
      }
      cell.value = value;
      styleVarDataCell(cell, getZebraFill(i), { wrap: f.type === "list" || f.type === "textarea" });
      if (f.type === "proficiency") addListDropdown(cell, PROFICIENCY_LEVELS);
      if (f.type === "language") addListDropdown(cell, COMMON_LANGUAGES.slice(0, 30)); // inline list formula length cap
    });
    if (section.fields.some((f) => f.type === "list" || f.type === "textarea")) r.height = 32;
    row++;
  }
}

export async function generateCvVariablesTemplate(cvData: CvData, fileBaseName?: string): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Task Manager System";
  workbook.created = new Date();

  buildVarInstructionsSheet(workbook, [
    ["How This Template Works", ""],
    ["Contact & Details", "One value per field. \"Include Declaration\" / \"Show Verified Badge\" use a Yes/No dropdown."],
    ["Section sheets", `Each sheet (Work Experience, Education, ...) is one row per entry. ${BLANK_ROWS_PER_SECTION} blank rows are pre-formatted for new entries below your existing ones — just fill them in.`],
    ["Responsibilities", "One bullet per line within the cell (press Alt+Enter for a new line in Excel)."],
    ["Saving", "Save as .xlsx before importing."],
    ["Importing", "Use \"Import from Excel\" in the CV Builder to replace the current draft with this file's content."],
  ]);

  buildContactSheet(workbook, cvData);
  ARRAY_SECTION_DEFS.forEach((s) => buildArraySheet(workbook, s.id, cvData));

  const base = fileBaseName || (cvData.personalInfo?.fullName ? cvData.personalInfo.fullName.replace(/[^a-z0-9]+/gi, "_") : "CV");
  await downloadVarWorkbook(workbook, `${base}_CV_Data_${new Date().toISOString().split("T")[0]}.xlsx`);
}
