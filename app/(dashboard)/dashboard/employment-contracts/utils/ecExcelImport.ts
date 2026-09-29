// Reads a workbook produced by ecExcelExport.ts back into a placeholder_overrides patch (plus
// optional basic_salary/currency). Matches rows by their Token column against the currently
// loaded placeholders — never writes to Supabase directly; the caller (ContractEditor.tsx)
// feeds the result into the same updateOffer/handlePlaceholderOverride setters a manual edit
// already uses, so the existing save/generate flow persists it unchanged.
import ExcelJS from "exceljs";
import { readVarCell, buildVarHeaderMap } from "@/lib/excelVariablesExport";
import type { EcPlaceholder } from "./ecPlaceholders";
import { EC_SHEET_NAME } from "./ecExcelExport";

export interface EcImportResult {
  placeholderOverrides: Record<string, string>;
  basicSalary?: number | null;
  currency?: string;
  fieldsChanged: number;
  skippedLocked: number;
}

export async function importEcContractExcel(
  file: File,
  placeholders: EcPlaceholder[],
  placeholderValues: Record<string, string>
): Promise<EcImportResult | null> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());

  const ws = workbook.getWorksheet(EC_SHEET_NAME);
  if (!ws) return null;

  const byKey = new Map(placeholders.map((p) => [p.key, p]));
  const overrides: Record<string, string> = {};
  let fieldsChanged = 0;
  let skippedLocked = 0;
  let basicSalary: number | null | undefined;
  let currency: string | undefined;

  // Find every row whose column A/B pair reads like a Token/Field-Label row by checking each
  // row against the header labels this sheet's own leaf-header rows use — simplest robust way
  // to walk a sheet built from repeating section blocks (banner + N section headers) without
  // hardcoding row numbers.
  for (let r = 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const tokenCandidate = readVarCell(row, 1);
    if (!tokenCandidate) continue;

    if (tokenCandidate === "basic_salary") {
      const raw = readVarCell(row, 4);
      basicSalary = raw === "" ? null : Number(raw);
      continue;
    }
    if (tokenCandidate === "currency") {
      const raw = readVarCell(row, 4);
      if (raw) currency = raw;
      continue;
    }

    const placeholder = byKey.get(tokenCandidate);
    if (!placeholder) continue; // not a data row (banner/section/header text) or unknown token

    if (!placeholder.editable) { skippedLocked++; continue; }

    const raw = readVarCell(row, 4);
    const baseline = placeholderValues[placeholder.key] ?? "";
    if (raw !== baseline) {
      overrides[placeholder.key] = raw;
      fieldsChanged++;
    }
  }

  if (fieldsChanged === 0 && basicSalary === undefined && currency === undefined) {
    return { placeholderOverrides: {}, fieldsChanged: 0, skippedLocked };
  }

  return { placeholderOverrides: overrides, basicSalary, currency, fieldsChanged, skippedLocked };
}
