// Shared styled .xlsx engine (ExcelJS) for every Export button in the Email Center — one place that
// knows how to build a title/subtitle banner, a colored header row, zebra striping, semantic per-cell
// coloring and a frozen header, so Cases/Emails/Mailboxes exports all read as one system instead of
// each hand-rolling the same styling. Mirrors the conventions the rest of the app's exports already
// use (see summary-reports/utils/exportSummary.ts) — same accent, same banner shape.
import ExcelJS from "exceljs"

export const ACCENT_HEX = "376BAE" // custom-blue

// Tailwind color -> ARGB, for the "text-*-*" tone classes several shared() helpers (ruleOutcome,
// DISPOSITION_BADGE, etc.) already return — one lookup so every export colors the same tone the same way.
export const TONE_ARGB: Record<string, string> = {
  "text-red-600": "FFDC2626",
  "text-red-500": "FFEF4444",
  "text-slate-500": "FF64748B",
  "text-slate-400": "FF94A3B8",
  "text-amber-600": "FFD97706",
  "text-emerald-600": "FF059669",
  "text-blue-600": "FF2563EB",
}

// A category's own `color` (a "#rrggbb" hex string) -> ARGB, for coloring a cell the same shade as
// its on-screen pill.
export function hexToArgb(hex: string | null | undefined, fallback: string): string {
  const clean = (hex ?? "").replace("#", "").trim()
  return /^[0-9a-fA-F]{6}$/.test(clean) ? `FF${clean.toUpperCase()}` : fallback
}

// One figure in the stats band printed between the subtitle and the column headers (Total / Missing
// / Completed …). `color` is ARGB for the big value; the label always uses the muted slate.
export interface ExcelStat {
  label: string
  value: string | number
  color?: string
}

// index is the row's position in `rows` (0-based) — passed through so a value like "#" doesn't need
// its own O(n) indexOf() per row.
export interface ExcelColumn<T> {
  header: string
  width: number
  wrap?: boolean
  align?: "left" | "center" | "right"
  value: (row: T, index: number) => string
  // Optional per-cell styling, checked per row for this column only (e.g. an overdue date in red).
  color?: (row: T, index: number) => string | null // ARGB, e.g. "FFDC2626"
  bold?: (row: T, index: number) => boolean
}

export function downloadWorkbookBlob(buffer: ExcelJS.Buffer, filename: string) {
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })
  const link = document.createElement("a")
  link.href = URL.createObjectURL(blob)
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(link.href)
}

export async function exportRowsToExcel<T>(opts: {
  title: string
  subtitle: string
  sheetName: string
  filename: string
  columns: ExcelColumn<T>[]
  rows: T[]
  // Optional summary figures shown as a two-row band (label over value) directly above the column
  // headers, so a reader sees the totals without scrolling to the bottom of the data.
  stats?: ExcelStat[]
  // Optional whole-row background override (e.g. an overdue case tinted red), checked before the
  // normal zebra stripe.
  rowFill?: (row: T, index: number) => string | null // ARGB
  // Optional whole-row dimming (e.g. a handled notification, or an inactive rule) — italic + muted.
  rowMuted?: (row: T, index: number) => boolean
}): Promise<void> {
  const { title, subtitle, sheetName, filename, columns, rows, stats, rowFill, rowMuted } = opts
  const numCols = columns.length

  const wb = new ExcelJS.Workbook()
  wb.creator = "Task Manager System"
  wb.created = new Date()
  const ws = wb.addWorksheet(sheetName)

  ws.mergeCells(1, 1, 1, numCols)
  const titleCell = ws.getCell(1, 1)
  titleCell.value = title
  titleCell.font = { name: "Calibri", bold: true, size: 18, color: { argb: "FFFFFFFF" } }
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${ACCENT_HEX}` } }
  titleCell.alignment = { horizontal: "center", vertical: "middle" }
  ws.getRow(1).height = 40

  ws.mergeCells(2, 1, 2, numCols)
  const subtitleCell = ws.getCell(2, 1)
  subtitleCell.value = subtitle
  subtitleCell.font = { name: "Calibri", size: 10, color: { argb: "FF475569" } }
  subtitleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } }
  subtitleCell.alignment = { horizontal: "center", vertical: "middle" }
  ws.getRow(2).height = 20

  // The stats band, when present, takes two rows (label over value) and each figure owns an equal
  // share of the table width. A table narrower than the number of figures can't be split into
  // blocks, so that case falls back to one line of "Label: value" pairs.
  let headerRowNumber = 4
  if (stats?.length) {
    ws.getRow(3).height = 6
    if (numCols < stats.length) {
      ws.mergeCells(4, 1, 4, numCols)
      const cell = ws.getCell(4, 1)
      cell.value = stats.map((s) => `${s.label}: ${s.value}`).join("     ")
      cell.font = { name: "Calibri", size: 10, bold: true, color: { argb: "FF334155" } }
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } }
      cell.alignment = { horizontal: "center", vertical: "middle" }
      ws.getRow(4).height = 22
      headerRowNumber = 5
    } else {
      const span = Math.floor(numCols / stats.length)
      stats.forEach((stat, i) => {
        const startCol = i * span + 1
        // The last figure absorbs any remainder, so the band always spans the full table width.
        const endCol = i === stats.length - 1 ? numCols : startCol + span - 1

        ws.mergeCells(5, startCol, 5, endCol)
        const labelCell = ws.getCell(5, startCol)
        labelCell.value = stat.label.toUpperCase()
        labelCell.font = { name: "Calibri", size: 8, bold: true, color: { argb: "FF64748B" } }
        labelCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } }
        labelCell.alignment = { horizontal: "center", vertical: "middle" }
        labelCell.border = { bottom: { style: "hair", color: { argb: "FFE2E8F0" } } }

        ws.mergeCells(6, startCol, 6, endCol)
        const valueCell = ws.getCell(6, startCol)
        valueCell.value = stat.value
        valueCell.font = { name: "Calibri", size: 16, bold: true, color: { argb: stat.color ?? "FF1E293B" } }
        valueCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } }
        valueCell.alignment = { horizontal: "center", vertical: "middle" }
        valueCell.border = { bottom: { style: "hair", color: { argb: "FFE2E8F0" } } }
      })
      ws.getRow(5).height = 16
      ws.getRow(6).height = 26
      ws.getRow(7).height = 6
      headerRowNumber = 8
    }
  } else {
    ws.addRow([])
    ws.getRow(3).height = 6
  }

  const headerRow = ws.addRow(columns.map((c) => c.header))
  headerRow.height = 22
  headerRow.eachCell((cell) => {
    cell.font = { name: "Calibri", bold: true, size: 9, color: { argb: "FF1E293B" } }
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } }
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true }
    cell.border = { bottom: { style: "medium", color: { argb: "FF94A3B8" } }, right: { style: "hair", color: { argb: "FFE2E8F0" } } }
  })

  rows.forEach((r, idx) => {
    const values = columns.map((c) => c.value(r, idx))
    const row = ws.addRow(values)
    const wrapped = columns.some((c) => c.wrap)
    if (wrapped) {
      const maxLines = Math.max(...values.map((v) => v.split("\n").length), 1)
      row.height = Math.max(16, Math.min(maxLines, 6) * 14)
    }
    const muted = rowMuted?.(r, idx) ?? false
    const bg = rowFill?.(r, idx) ?? (idx % 2 === 0 ? "FFFFFFFF" : "FFF8FAFC")

    row.eachCell((cell, colNum) => {
      const col = columns[colNum - 1]
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: muted ? "FFF1F5F9" : bg } }
      cell.border = { bottom: { style: "hair", color: { argb: "FFE2E8F0" } }, right: { style: "hair", color: { argb: "FFE2E8F0" } } }
      cell.alignment = { horizontal: col.align ?? "left", vertical: "middle", wrapText: !!col.wrap }
      cell.font = {
        name: "Calibri",
        size: 9,
        color: { argb: col.color?.(r, idx) ?? "FF334155" },
        bold: col.bold?.(r, idx) ?? false,
        italic: muted,
      }
    })
  })

  columns.forEach((c, i) => { ws.getColumn(i + 1).width = c.width })
  // Freeze everything down to the column headers, wherever they ended up (the stats band pushes them
  // down two rows when it's present).
  ws.views = [{ state: "frozen", xSplit: 0, ySplit: headerRowNumber }]

  const buffer = await wb.xlsx.writeBuffer()
  downloadWorkbookBlob(buffer, filename)
}

export function timestampedFilename(base: string): string {
  return `${base}-${new Date().toISOString().split("T")[0]}.xlsx`
}
