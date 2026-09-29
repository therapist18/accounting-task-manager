// Reads a workbook produced by ccExcelExport.ts back into an overrides patch (scalar) and a
// full arrayData replacement (per block) — the exact shapes page.tsx already keeps in state.
// Never writes to Supabase directly; the caller merges these into `overrides`/`arrayData`
// state and the existing "Save" button (page.tsx's handleSave) persists them exactly as a
// manual edit would.
import ExcelJS from "exceljs";
import { readVarCell, buildVarHeaderMap } from "@/lib/excelVariablesExport";
import { isCcComputedKey } from "./ccExcelExport";

// Structurally loose on purpose — see the matching comment in ccExcelExport.ts.
type CcPlaceholder = { key: string; label?: string; editable?: boolean; default_value?: string | null; is_block_start?: boolean; parent_name?: string | null };

export interface CcImportResult {
  overridesPatch: Record<string, string>;
  arrayDataPatch: Record<string, Record<string, string>[]>;
  fieldsChanged: number;
  skippedLocked: number;
}

function readMainSheet(ws: ExcelJS.Worksheet, scalarPlaceholders: CcPlaceholder[], resolvedValues: Record<string, string>, overrides: Record<string, string>) {
  const byKey = new Map(scalarPlaceholders.map((p) => [p.key, p]));
  const patch: Record<string, string> = {};
  let changed = 0;
  let skippedLocked = 0;
  for (let r = 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const token = readVarCell(row, 1);
    if (!token) continue;
    const placeholder = byKey.get(token);
    if (!placeholder || isCcComputedKey(placeholder.key)) continue;
    if (placeholder.editable === false) { skippedLocked++; continue; }
    const raw = readVarCell(row, 4);
    const baseline = overrides[placeholder.key] ?? resolvedValues[placeholder.key] ?? placeholder.default_value ?? "";
    if (raw !== baseline) { patch[placeholder.key] = raw; changed++; }
  }
  return { patch, changed, skippedLocked };
}

function readBlockSheet(ws: ExcelJS.Worksheet, children: CcPlaceholder[]): Record<string, string>[] {
  // Locate the leaf header row by matching cell text against this block's own child labels,
  // since a banner without a subtitle collapses to a single merged row 1, not always row 2.
  let headerRowNum = 0;
  for (let r = 1; r <= Math.min(ws.rowCount, 5); r++) {
    const rowLabels = new Set<string>();
    ws.getRow(r).eachCell((cell) => rowLabels.add(String(cell.value ?? "").trim().toLowerCase()));
    const matches = children.filter((c) => rowLabels.has((c.label || c.key).trim().toLowerCase())).length;
    if (matches === children.length && children.length > 0) { headerRowNum = r; break; }
  }
  if (!headerRowNum) return [];
  const colMap = buildVarHeaderMap(ws, headerRowNum);
  const colFor = children.map((c) => colMap.get((c.label || c.key).trim().toLowerCase()) || 0);

  const rows: Record<string, string>[] = [];
  for (let r = headerRowNum + 1; r <= ws.rowCount; r++) {
    const wsRow = ws.getRow(r);
    const row: Record<string, string> = {};
    let hasAny = false;
    children.forEach((c, i) => {
      const raw = readVarCell(wsRow, colFor[i]);
      if (raw) hasAny = true;
      row[c.key] = raw;
    });
    if (hasAny) rows.push(row);
  }
  return rows;
}

export async function importCcContractExcel(
  file: File,
  scalarPlaceholders: CcPlaceholder[],
  allPlaceholders: CcPlaceholder[],
  resolvedValues: Record<string, string>,
  overrides: Record<string, string>
): Promise<CcImportResult | null> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());

  const mainWs = workbook.getWorksheet("Contract Fields");
  if (!mainWs) return null;

  const { patch, changed, skippedLocked } = readMainSheet(mainWs, scalarPlaceholders, resolvedValues, overrides);

  const arrayDataPatch: Record<string, Record<string, string>[]> = {};
  const blocks = allPlaceholders.filter((p) => p.is_block_start);
  for (const block of blocks) {
    const sheetName = (block.label || block.key).slice(0, 31);
    const ws = workbook.getWorksheet(sheetName);
    if (!ws) continue;
    const children = allPlaceholders.filter((c) => c.parent_name === block.key);
    if (children.length === 0) continue;
    arrayDataPatch[block.key] = readBlockSheet(ws, children);
  }

  return { overridesPatch: patch, arrayDataPatch, fieldsChanged: changed, skippedLocked };
}
