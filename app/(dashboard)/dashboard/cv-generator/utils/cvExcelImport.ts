// Reads a workbook produced by cvExcelExport.ts (or hand-edited from it) back into a CvData
// object. This is a full in-memory replace of the current draft's fields — there's no per-row
// id/matching concept the way EC/CC's key-value overrides have, since a CV's arrays are
// entirely local state (setCvData), not rows tied to a database id.
import ExcelJS from "exceljs";
import { readVarCell, buildVarHeaderMap } from "@/lib/excelVariablesExport";
import { SCALAR_FIELD_DEFS, ARRAY_SECTION_DEFS, setScalarValue } from "./cvVariablesConfig";
import { getMissingFields } from "./cvGeneratorData";
import type { CvData } from "./cvGeneratorData";

export interface CvImportSummary {
  scalarFieldsRead: number;
  sections: { id: string; label: string; rowsImported: number; rowsWithMissingRequired: number }[];
}

function readContactSheet(ws: ExcelJS.Worksheet, base: CvData): { data: CvData; count: number } {
  let data: any = base;
  let count = 0;
  // Field label is in column A, value in column B, on whichever row it lands on (banner +
  // section headers shift rows around, so match by the label text rather than a fixed row).
  const labelToField = new Map(SCALAR_FIELD_DEFS.map((f) => [f.label.trim().toLowerCase(), f]));
  ws.eachRow((row) => {
    const label = String(row.getCell(1).value ?? "").trim().toLowerCase();
    const field = labelToField.get(label);
    if (!field) return;
    const raw = readVarCell(row, 2);
    const value = field.type === "boolean" ? /^y(es)?$/i.test(raw) : raw;
    data = setScalarValue(data, field.path, value);
    count++;
  });
  return { data, count };
}

function readArraySheet(ws: ExcelJS.Worksheet, sectionId: string): { items: any[]; missingCount: number } {
  const section = ARRAY_SECTION_DEFS.find((s) => s.id === sectionId)!;
  // Header row is whichever row's cells match this section's field labels exactly.
  const labelSet = new Set(section.fields.map((f) => f.label.trim().toLowerCase()));
  let headerRowNum = 0;
  for (let r = 1; r <= Math.min(ws.rowCount, 10); r++) {
    const rowLabels = new Set<string>();
    ws.getRow(r).eachCell((cell) => rowLabels.add(String(cell.value ?? "").trim().toLowerCase()));
    const matches = section.fields.filter((f) => rowLabels.has(f.label.trim().toLowerCase())).length;
    if (matches === section.fields.length) { headerRowNum = r; break; }
  }
  if (!headerRowNum) return { items: [], missingCount: 0 };

  const headerToCol = buildVarHeaderMap(ws, headerRowNum);
  const colFor = section.fields.map((f) => headerToCol.get(f.label.trim().toLowerCase()) || 0);

  const items: any[] = [];
  let missingCount = 0;
  for (let r = headerRowNum + 1; r <= ws.rowCount; r++) {
    const wsRow = ws.getRow(r);
    const item: Record<string, any> = {};
    let hasAny = false;
    section.fields.forEach((f, i) => {
      const raw = readVarCell(wsRow, colFor[i]);
      if (raw) hasAny = true;
      item[f.key] = f.type === "list" ? raw.split("\n").map((l) => l.trim()).filter(Boolean) : raw;
    });
    if (!hasAny) continue;
    items.push(item);
    if (getMissingFields(sectionId, item).length > 0) missingCount++;
  }
  return { items, missingCount };
}

export async function importCvVariablesFile(file: File, currentCvData: CvData): Promise<{ cvData: CvData; summary: CvImportSummary } | null> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());

  const contactWs = workbook.getWorksheet("Contact & Details");
  let cvData: CvData = currentCvData;
  let scalarFieldsRead = 0;
  if (contactWs) {
    const result = readContactSheet(contactWs, currentCvData);
    cvData = result.data;
    scalarFieldsRead = result.count;
  }

  const sections: CvImportSummary["sections"] = [];
  for (const section of ARRAY_SECTION_DEFS) {
    const ws = workbook.getWorksheet(section.label.slice(0, 31));
    if (!ws) continue;
    const { items, missingCount } = readArraySheet(ws, section.id);
    if (items.length === 0 && missingCount === 0) continue;
    (cvData as any) = { ...cvData, [section.id]: items };
    sections.push({ id: section.id, label: section.label, rowsImported: items.length, rowsWithMissingRequired: missingCount });
  }

  if (!contactWs && sections.length === 0) return null;
  return { cvData, summary: { scalarFieldsRead, sections } };
}
