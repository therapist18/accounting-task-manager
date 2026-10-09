// Client-side Task Basket report: one company's (or everyone's) outstanding and late items as a PDF
// or an Excel workbook, for downloading or sending to the client (api/task-basket/send-report).
import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"
import ExcelJS from "exceljs"
import {
  TASK_BASKET_MODULE_LABELS,
  TASK_BASKET_STATUS_LABELS,
  outstandingLines,
  type TaskBasketItem,
} from "@/lib/supabase/taskBasket"

export type ReportFormat = "pdf" | "xlsx"

export interface ReportFile {
  base64: string
  fileName: string
  mimeType: string
  blob: Blob
}

const fmtDate = (ymd?: string | null) => {
  if (!ymd) return "—"
  const d = new Date(ymd.length === 10 ? `${ymd}T00:00:00` : ymd)
  return isNaN(d.getTime()) ? ymd : d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
}

/** The rows a report shows — the same columns in the PDF and the workbook. */
function reportRows(items: TaskBasketItem[], perCompany: boolean) {
  return items.map((item) => ({
    company: item.company_name,
    module: TASK_BASKET_MODULE_LABELS[item.module] ?? item.module,
    cycle: item.cycle_month,
    deadline: fmtDate(item.deadline),
    outstanding: (outstandingLines(item).join("\n") || item.reason),
    status: TASK_BASKET_STATUS_LABELS[item.status] ?? item.status,
    received: item.status === "received_late" ? fmtDate(item.resolved_at) : "",
    perCompany,
  }))
}

const slug = (s: string) => s.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "report"

async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer()
  let binary = ""
  const bytes = new Uint8Array(buffer)
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binary)
}

/**
 * Builds the report. `companyName` set = a per-company report for the client (no Company column);
 * unset = the overall view across companies.
 */
export async function buildBasketReport(items: TaskBasketItem[], format: ReportFormat, opts: { companyName?: string; cycleMonth?: string } = {}): Promise<ReportFile> {
  const perCompany = !!opts.companyName
  const title = perCompany ? `Outstanding items — ${opts.companyName}` : "Task Basket — outstanding items"
  const subtitle = [opts.cycleMonth && `Cycle ${opts.cycleMonth}`, `Generated ${new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })}`]
    .filter(Boolean).join(" · ")
  const rows = reportRows(items, perCompany)
  const open = items.filter((i) => i.status === "open").length
  const late = items.filter((i) => i.status === "received_late").length
  const baseName = `${perCompany ? slug(opts.companyName!) : "task-basket"}-${opts.cycleMonth || "all"}`

  const headers = [
    ...(perCompany ? [] : ["Company"]),
    "Item", "Cycle", "Deadline", "Outstanding", "Status", "Received",
  ]
  const values = (r: ReturnType<typeof reportRows>[number]) => [
    ...(perCompany ? [] : [r.company]),
    r.module, r.cycle, r.deadline, r.outstanding, r.status, r.received,
  ]

  if (format === "pdf") {
    const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" })
    doc.setFontSize(15)
    doc.text(title, 40, 40)
    doc.setFontSize(9)
    doc.setTextColor(100)
    doc.text(`${subtitle} · ${open} outstanding · ${late} received after the deadline`, 40, 58)
    autoTable(doc, {
      startY: 72,
      head: [headers],
      body: rows.map(values),
      styles: { fontSize: 8, cellPadding: 4, valign: "top" },
      headStyles: { fillColor: [37, 99, 235] },
      columnStyles: { [perCompany ? 3 : 4]: { cellWidth: 260 } },
      didParseCell: (data) => {
        if (data.section !== "body") return
        const status = rows[data.row.index]?.status
        if (data.column.index === headers.indexOf("Status")) {
          data.cell.styles.textColor = status === "Open" ? [180, 83, 9] : status === "Received late" ? [3, 105, 161] : [4, 120, 87]
        }
      },
    })
    doc.setFontSize(8)
    doc.setTextColor(120)
    doc.text("Booksmart Consultancy", 40, doc.internal.pageSize.getHeight() - 20)
    const blob = doc.output("blob")
    return { blob, base64: await blobToBase64(blob), fileName: `${baseName}.pdf`, mimeType: "application/pdf" }
  }

  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet("Outstanding items")
  ws.addRow([title]).font = { bold: true, size: 14 }
  ws.addRow([`${subtitle} · ${open} outstanding · ${late} received after the deadline`]).font = { italic: true, color: { argb: "FF64748B" } }
  ws.addRow([])
  const head = ws.addRow(headers)
  head.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } }
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2563EB" } }
  })
  rows.forEach((r) => {
    const row = ws.addRow(values(r))
    row.alignment = { vertical: "top", wrapText: true }
  })
  const widths = [...(perCompany ? [] : [32]), 24, 10, 14, 60, 14, 14]
  widths.forEach((w, i) => { ws.getColumn(i + 1).width = w })
  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })
  return { blob, base64: await blobToBase64(blob), fileName: `${baseName}.xlsx`, mimeType: blob.type }
}

export function downloadReport(file: ReportFile) {
  const url = URL.createObjectURL(file.blob)
  const a = document.createElement("a")
  a.href = url
  a.download = file.fileName
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** The default client message for a report. */
export function defaultReportMessage(companyName: string, items: TaskBasketItem[]): string {
  const open = items.filter((i) => i.status === "open")
  const lines = [
    `Dear ${companyName},`,
    "",
    open.length
      ? "Please find attached a summary of the items we are still waiting for from you:"
      : "Please find attached a summary of your recent submissions.",
  ]
  for (const item of open) {
    const details = outstandingLines(item)
    lines.push(`• ${TASK_BASKET_MODULE_LABELS[item.module] ?? item.module}${item.deadline ? ` (due ${fmtDate(item.deadline)})` : ""}${details.length ? `: ${details.join("; ")}` : ""}`)
  }
  lines.push("", "Kindly share them at your earliest convenience.", "", "Thank you,", "Booksmart Consultancy")
  return lines.join("\n")
}
