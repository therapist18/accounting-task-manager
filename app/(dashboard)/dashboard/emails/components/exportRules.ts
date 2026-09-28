// Rules tab -> styled .xlsx export (ExcelJS), following the same conventions as the rest of the app's
// exports (see summary-reports/utils/exportSummary.ts): a title/subtitle banner, a colored header row,
// zebra-striped data rows, semantic cell coloring, frozen header, and wrapped multi-line cells for
// wordings/senders — so the sheet reads the same way the Rules table does, not just as a raw dump.
import ExcelJS from "exceljs"
import { ruleOutcome, type CategoryOption, type RuleRow } from "./shared"

const ACCENT_HEX = "376BAE" // custom-blue, matches every other export in this app

// Tailwind color -> ARGB, for the same tone classes ruleOutcome() already returns.
const TONE_ARGB: Record<string, string> = {
  "text-red-600": "FFDC2626",
  "text-slate-500": "FF64748B",
  "text-slate-400": "FF94A3B8",
  "text-amber-600": "FFD97706",
  "text-emerald-600": "FF059669",
  "text-blue-600": "FF2563EB",
}

const hexToArgb = (hex: string | null | undefined, fallback: string) => {
  const clean = (hex ?? "").replace("#", "").trim()
  return /^[0-9a-fA-F]{6}$/.test(clean) ? `FF${clean.toUpperCase()}` : fallback
}

const downloadBlob = (blob: Blob, filename: string) => {
  const link = document.createElement("a")
  link.href = URL.createObjectURL(blob)
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(link.href)
}

const wordingsOf = (r: RuleRow) => [r.pattern, ...(r.extra_patterns ?? [])].filter(Boolean).join("\n")
const sendersOf = (r: RuleRow) => [r.sender_pattern, ...(r.extra_sender_patterns ?? [])].filter(Boolean).join("\n")

const actionOf = (r: RuleRow, cat: CategoryOption | undefined) => {
  if (r.is_ignore && r.hard_ignore) return "Ignore & delete"
  if (r.is_ignore) return "Ignore"
  if (r.is_notify) return "Flag as important"
  return cat?.name ?? r.category_key
}

const fmt = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString() : "")

const COLUMNS: Array<{ header: string; width: number; wrap?: boolean }> = [
  { header: "#", width: 5 },
  { header: "Order", width: 8 },
  { header: "Match type", width: 12 },
  { header: "Subject wordings", width: 42, wrap: true },
  { header: "Sender", width: 30, wrap: true },
  { header: "Sender match type", width: 14 },
  { header: "Action / Category", width: 24 },
  { header: "Result", width: 34 },
  { header: "Confidence", width: 12 },
  { header: "Active", width: 9 },
  { header: "Created", width: 22 },
  { header: "Created by", width: 18 },
  { header: "Last updated", width: 22 },
  { header: "Updated by", width: 18 },
  { header: "Notes", width: 34, wrap: true },
]

export async function exportRulesToExcel(rules: RuleRow[], categories: CategoryOption[]): Promise<void> {
  const catByKey = new Map(categories.map((c) => [c.key, c]))
  const numCols = COLUMNS.length

  const wb = new ExcelJS.Workbook()
  wb.creator = "Task Manager System"
  wb.created = new Date()
  const ws = wb.addWorksheet("Classification Rules")

  // Title banner
  ws.mergeCells(1, 1, 1, numCols)
  const title = ws.getCell(1, 1)
  title.value = "KRA EMAIL CLASSIFICATION RULES"
  title.font = { name: "Calibri", bold: true, size: 18, color: { argb: "FFFFFFFF" } }
  title.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${ACCENT_HEX}` } }
  title.alignment = { horizontal: "center", vertical: "middle" }
  ws.getRow(1).height = 40

  // Subtitle
  const activeCount = rules.filter((r) => r.is_active).length
  ws.mergeCells(2, 1, 2, numCols)
  const subtitle = ws.getCell(2, 1)
  subtitle.value = `${rules.length} rule${rules.length === 1 ? "" : "s"}  ·  ${activeCount} active, ${rules.length - activeCount} inactive  ·  Generated: ${new Date().toLocaleString()}`
  subtitle.font = { name: "Calibri", size: 10, color: { argb: "FF475569" } }
  subtitle.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } }
  subtitle.alignment = { horizontal: "center", vertical: "middle" }
  ws.getRow(2).height = 20

  ws.addRow([])
  ws.getRow(3).height = 6

  // Header row
  const headerRow = ws.addRow(COLUMNS.map((c) => c.header))
  headerRow.height = 22
  headerRow.eachCell((cell) => {
    cell.font = { name: "Calibri", bold: true, size: 9, color: { argb: "FF1E293B" } }
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } }
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true }
    cell.border = { bottom: { style: "medium", color: { argb: "FF94A3B8" } }, right: { style: "hair", color: { argb: "FFE2E8F0" } } }
  })

  // Data rows — sort_order order, matching how the rules are actually tried
  const ordered = [...rules].sort((a, b) => a.sort_order - b.sort_order)
  ordered.forEach((r, idx) => {
    const cat = catByKey.get(r.category_key)
    const outcome = ruleOutcome(r, cat)
    const values = [
      idx + 1,
      r.sort_order,
      r.match_type === "regex" ? "Regex" : "Contains",
      wordingsOf(r) || "Any subject",
      sendersOf(r) || "Any sender",
      sendersOf(r) ? (r.sender_match_type === "regex" ? "Regex" : "Contains") : "",
      actionOf(r, cat),
      outcome.label,
      `${Math.round(r.confidence * 100)}%`,
      r.is_active ? "Yes" : "No",
      fmt(r.created_at),
      r.created_by_name ?? (r.created_at ? "System" : ""),
      fmt(r.updated_at),
      r.updated_by_name ?? "",
      r.notes ?? "",
    ]
    const row = ws.addRow(values)
    const wrappedLines = Math.max(wordingsOf(r).split("\n").length, sendersOf(r).split("\n").length, 1)
    row.height = Math.max(16, Math.min(wrappedLines, 6) * 14)
    const bg = idx % 2 === 0 ? "FFFFFFFF" : "FFF8FAFC"
    const actionArgb = r.is_ignore || r.is_notify ? null : hexToArgb(cat?.color, "FF334155")

    row.eachCell((cell, colNum) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: r.is_active ? bg : "FFF1F5F9" } }
      cell.border = { bottom: { style: "hair", color: { argb: "FFE2E8F0" } }, right: { style: "hair", color: { argb: "FFE2E8F0" } } }
      const col = COLUMNS[colNum - 1]
      cell.alignment = { horizontal: colNum <= 2 ? "center" : "left", vertical: "middle", wrapText: !!col?.wrap }

      let color = "FF334155"
      let bold = false
      let italic = !r.is_active
      if (colNum === 7 && actionArgb) { color = actionArgb; bold = true } // Action / Category
      else if (colNum === 8) { color = TONE_ARGB[outcome.tone] ?? "FF334155"; bold = true } // Result
      else if (colNum === 10) { color = r.is_active ? "FF059669" : "FF94A3B8" } // Active

      cell.font = { name: "Calibri", size: 9, color: { argb: color }, bold, italic }
    })
  })

  COLUMNS.forEach((c, i) => { ws.getColumn(i + 1).width = c.width })
  ws.views = [{ state: "frozen", xSplit: 0, ySplit: 4 }]

  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })
  const timestamp = new Date().toISOString().split("T")[0]
  downloadBlob(blob, `kra-classification-rules-${timestamp}.xlsx`)
}
